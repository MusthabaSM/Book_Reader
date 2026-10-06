import type { BookImporter, FileInput, FormatIdentifier, ImportResult, ImportArtifact } from '../../models';
import type { DocumentStorageRepository } from '../../../library/repository';
import type { FixedDocument, FixedDocumentPage } from '../../../book/models/fixed';

async function computeSha256(bytes: Uint8Array): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
            const hash = await crypto.subtle.digest('SHA-256', bytes as any);
            return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch {
            return 'hash-failed';
        }
    }
    // Fallback for node testing if crypto is not globally available in the same way
    if (typeof process !== 'undefined' && typeof require !== 'undefined') {
        try {
            const cryptoNode = require('crypto');
            return cryptoNode.createHash('sha256').update(bytes).digest('hex');
        } catch {
            return 'node-hash-failed';
        }
    }
    return 'unknown';
}

export class PdfImporter implements BookImporter {
    public readonly supportedFormats: FormatIdentifier[] = ['pdf'];
    private storage: DocumentStorageRepository;

    constructor(storage: DocumentStorageRepository) {
        this.storage = storage;
    }

    public async canImport(file: FileInput): Promise<boolean> {
        // Can be improved later if we read magic bytes directly here,
        // but typically LibraryService uses the FormatDetector first.
        return file.extension.toLowerCase() === '.pdf' || file.mimeType === 'application/pdf';
    }

    public async import(file: FileInput): Promise<ImportResult> {
        let documentId = '';
        try {
            // Note: The current storage architecture requires the complete binary in memory.
            // True large-file streaming/range loading is not yet solved at this import-storage boundary.
            const bytes = await file.dataSource.readBytes();

            // 1. Validate Binary Integrity / PDF Header
            // We strictly reject non-PDF streams (like accidentally returned HTML shells starting with <div)
            const hasStrictPdfHeader = String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
            if (!hasStrictPdfHeader) {
                const first8Bytes = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                throw new Error(JSON.stringify({
                    isStructuredDiagnostic: true,
                    code: 'BINARY_INTEGRITY_FAILED',
                    message: `Invalid PDF header. Expected '%PDF-', got bytes: ${first8Bytes}`,
                    originalByteLength: bytes.byteLength,
                    first8Bytes,
                    hasPdfHeader: false
                }));
            }

            // 2. Generate opaque documentSourceId
            documentId = `pdf-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

            // 3. Store original PDF through DocumentStorageRepository
            await this.storage.storeDocument(documentId, bytes);

            // 3. Load the document through PdfEngine
            const { PdfEngine } = await import('../../pdf/engine');
            const source = await this.storage.getDocumentSource(documentId);
            
            let docHandle;
            try {
                docHandle = await PdfEngine.loadDocument(source);
            } catch (loadError: any) {
                // If the load failed, we capture detailed diagnostics
                const first8Bytes = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                const hasPdfHeader = String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
                const originalSha256 = await computeSha256(bytes);
                
                let storedSha256 = 'not-fetched';
                let storedByteLength = -1;
                
                try {
                    // Test if we can fetch from the url to verify storage integrity
                    const res = await fetch(source.url);
                    if (res.ok) {
                        const buffer = await res.arrayBuffer();
                        const storedBytes = new Uint8Array(buffer);
                        storedByteLength = storedBytes.byteLength;
                        storedSha256 = await computeSha256(storedBytes);
                    }
                } catch {
                    storedSha256 = 'fetch-failed';
                }

                // Do not run both diagnostic tests simultaneously. Run sequentially.
                const diagnostics = await PdfEngine.diagnoseLoading(source, bytes);
                
                throw new Error(JSON.stringify({
                    isStructuredDiagnostic: true,
                    code: diagnostics.dataLoadSucceeded && !diagnostics.urlLoadSucceeded ? 'STORAGE_CORRUPTION' : 
                          (loadError.name === 'InvalidPDFException' || loadError.message?.includes('Invalid PDF structure')) ? 'INVALID_PDF_STRUCTURE' : 'PDF_IMPORT_ERROR',
                    pdfJsErrorName: loadError.name,
                    pdfJsErrorMessage: loadError.message,
                    pdfJsErrorConstructor: loadError.constructor?.name,
                    originalByteLength: bytes.byteLength,
                    dataInputByteLength: bytes.byteLength, // They are the same at this stage
                    storedByteLength,
                    first8Bytes,
                    hasPdfHeader,
                    originalSha256,
                    dataInputSha256: originalSha256, // They are the same array here
                    storedSha256,
                    dataLoadSucceeded: diagnostics.dataLoadSucceeded,
                    urlLoadSucceeded: diagnostics.urlLoadSucceeded,
                    dataError: diagnostics.dataError,
                    urlError: diagnostics.urlError
                }));
            }

            // 4. Extract metadata
            const metadata = await docHandle.getMetadata();
            
            // 5. Create basic BookMetadata
            const fallbackTitle = file.fileName.replace(/\.[^/.]+$/, "");
            
            const authors = metadata.author ? [{ id: metadata.author, displayName: metadata.author }] : [];

            // 6. Extract page geometry
            const pageCount = docHandle.getPageCount();
            const pages: FixedDocumentPage[] = [];

            // Performance: We only extract geometry, we DO NOT render.
            // For a large PDF this might still take a moment, but pdf.js handles page fetching lazily 
            // if configured, although getPage() fetches the page dict.
            for (let i = 0; i < pageCount; i++) {
                const pageHandle = await docHandle.getPage(i);
                pages.push({
                    pageIndex: i,
                    width: pageHandle.width,
                    height: pageHandle.height,
                    rotation: pageHandle.rotation
                });
            }

            // 7. Extract cover thumbnail from first page
            let coverBytes: Uint8Array | undefined = undefined;
            if (pageCount > 0) {
                try {
                    const firstPage = await docHandle.getPage(0);
                    // Determine scale to fit within max 400px
                    const MAX_DIM = 400;
                    const largestDim = Math.max(firstPage.width, firstPage.height);
                    const scale = largestDim > MAX_DIM ? (MAX_DIM / largestDim) : 1.0;
                    
                    const canvas = document.createElement('canvas');
                    // Give canvas integer dimensions
                    canvas.width = Math.floor(firstPage.width * scale);
                    canvas.height = Math.floor(firstPage.height * scale);
                    
                    // Actually render the page to canvas (with timeout for test environments)
                    const renderPromise = firstPage.render(canvas, scale);
                    await Promise.race([
                        renderPromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('PDF render timeout')), 1000))
                    ]);
                    
                    // Convert canvas to image bytes
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const base64 = dataUrl.split(',')[1];
                    const binaryString = atob(base64);
                    coverBytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        coverBytes[i] = binaryString.charCodeAt(i);
                    }
                } catch (e) {
                    console.warn('Failed to generate PDF cover thumbnail, import will proceed without cover.', e);
                }
            }

            // 8. Cleanup PdfEngine resources for the import phase
            await docHandle.destroy();

            // 9. Create FixedDocument
            const fixedDoc: FixedDocument = {
                type: 'fixed',
                id: documentId, // The Universal Book Model ID
                documentSourceId: documentId, // Link to the binary storage
                metadata: {
                    title: { value: metadata.title || fallbackTitle, provenance: metadata.title ? 'file-extracted' : 'filename-inferred' },
                    authors: { value: authors, provenance: 'file-extracted' },
                    genres: { value: [], provenance: 'file-extracted' },
                    originalFilename: file.fileName,
                    sourceFormat: 'pdf',
                    fileSizeBytes: file.fileSizeBytes,
                    coverInfo: coverBytes ? { resourceId: documentId } : undefined
                },
                resources: {},
                pageCount: pageCount,
                pages: pages
            };

            const artifacts: ImportArtifact[] = [
                { kind: 'document-binary', id: documentId }
            ];

            if (coverBytes) {
                artifacts.push({
                    kind: 'cover-image',
                    id: documentId,
                    data: coverBytes,
                    mimeType: 'image/jpeg'
                });
            }

            // 10. Return result with artifacts
            return {
                status: 'success',
                document: fixedDoc,
                artifacts
            };

        } catch (e: any) {
            // Rollback binary storage if we fail during import (before returning to LibraryService)
            if (documentId) {
                await this.storage.deleteDocument(documentId).catch(err => {
                    console.error('Failed to cleanup PDF binary during failed import:', err);
                });
            }
            
            let diagnosticDetails: any = null;
            let code = 'PDF_IMPORT_ERROR';
            let message = e.message || 'Unknown PDF import error';
            
            try {
                if (e.message && e.message.includes('isStructuredDiagnostic')) {
                    diagnosticDetails = JSON.parse(e.message);
                    code = diagnosticDetails.code;
                    message = diagnosticDetails.pdfJsErrorMessage || message;
                }
            } catch {
                // Not a structured diagnostic error
            }

            return {
                status: 'failure',
                error: {
                    code: code,
                    message: message,
                    details: diagnosticDetails || e
                }
            };
        }
    }
}
