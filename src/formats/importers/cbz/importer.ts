import JSZip from 'jszip';
import type { 
    BookImporter, 
    FileInput, 
    ImportResult, 
    ImportArtifact, 
    FormatIdentifier 
} from '../../models';
import type { FixedDocument, FixedDocumentPage } from '../../../book/models/fixed';
import type { DocumentStorageRepository } from '../../../library/repository';
import type { TocEntry } from '../../../book/models';

export class CbzImporter implements BookImporter {
    supportedFormats: FormatIdentifier[] = ['cbz'];
    private storage: DocumentStorageRepository;

    constructor(storage: DocumentStorageRepository) {
        this.storage = storage;
    }

    async canImport(file: FileInput): Promise<boolean> {
        if (file.extension.toLowerCase() === '.cbz' || file.extension.toLowerCase() === '.zip') {
            return true;
        }
        if (file.mimeType === 'application/vnd.comicbook+zip' || file.mimeType === 'application/x-cbz' || file.mimeType === 'application/zip') {
            return true;
        }
        return false;
    }

    async import(file: FileInput): Promise<ImportResult> {
        let documentId = '';
        try {
            const bytes = await file.dataSource.readBytes();
            let zip: JSZip;
            try {
                zip = await JSZip.loadAsync(bytes);
            } catch (err: any) {
                return {
                    status: 'failure',
                    error: {
                        code: 'INVALID_CBZ',
                        message: 'Failed to open CBZ archive',
                        details: err.message
                    }
                };
            }

            // Find all valid image entries
            const validExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
            const entries = Object.keys(zip.files)
                .filter(filename => !zip.files[filename].dir) // ignore directories
                .filter(filename => !filename.startsWith('__MACOSX/')) // ignore macosx system files
                .filter(filename => !filename.split('/').pop()?.startsWith('.')) // ignore hidden files
                .filter(filename => validExtensions.test(filename));
            
            if (entries.length === 0) {
                return {
                    status: 'failure',
                    error: {
                        code: 'INVALID_CBZ_NO_PAGES',
                        message: 'CBZ archive contains no valid image pages'
                    }
                };
            }

            // Natural sort to ensure '2.jpg' comes before '10.jpg'
            entries.sort((a, b) => {
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            });

            // 2. Generate opaque documentSourceId
            documentId = `cbz-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

            // 3. Store original CBZ through DocumentStorageRepository
            await this.storage.storeDocument(documentId, bytes);

            // Extract the first image as the cover
            const coverEntryName = entries[0];
            const coverEntry = zip.files[coverEntryName];
            const coverBytes = await coverEntry.async('uint8array');
            const ext = coverEntryName.split('.').pop()?.toLowerCase();
            const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            
            const coverArtifact: ImportArtifact = {
                kind: 'cover-image',
                id: documentId,
                data: coverBytes,
                mimeType
            };

            const pages: FixedDocumentPage[] = [];
            
            for (let i = 0; i < entries.length; i++) {
                let width = 800;
                let height = 1200;
                
                if (i === 0) {
                    const dims = await this.getImageDimensions(new Blob([coverBytes as unknown as BlobPart]));
                    width = dims.width;
                    height = dims.height;
                } else {
                    width = pages[0].width;
                    height = pages[0].height;
                }

                pages.push({
                    pageIndex: i,
                    width,
                    height,
                    rotation: 0
                });
            }

            // Build Table of Contents from directory paths
            const toc: TocEntry[] = [];
            
            for (let i = 0; i < entries.length; i++) {
                const pathParts = entries[i].split('/');
                if (pathParts.length > 1) {
                    // It's in a folder. Let's map it into the TOC structure.
                    // e.g., "Volume 1/Chapter 1/01.jpg"
                    let currentLevel = toc;
                    for (let j = 0; j < pathParts.length - 1; j++) {
                        const folderName = pathParts[j];
                        let existingEntry = currentLevel.find(e => e.title === folderName);
                        
                        if (!existingEntry) {
                            existingEntry = {
                                title: folderName,
                                targetPageIndex: i, // First image found in this folder
                                children: []
                            };
                            currentLevel.push(existingEntry);
                        }
                        
                        // We always want children array to exist if we are traversing deeper
                        if (!existingEntry.children) {
                            existingEntry.children = [];
                        }
                        
                        currentLevel = existingEntry.children;
                    }
                }
            }

            // Clean up empty children arrays to keep the model tidy
            const cleanToc = (entries: TocEntry[]) => {
                for (const entry of entries) {
                    if (entry.children && entry.children.length === 0) {
                        delete entry.children;
                    } else if (entry.children) {
                        cleanToc(entry.children);
                    }
                }
            };
            cleanToc(toc);

            const doc: FixedDocument = {
                type: 'fixed',
                id: documentId,
                documentSourceId: documentId, 
                pageCount: pages.length,
                pages: pages,
                metadata: {
                    title: { value: file.fileName.replace(/\.cbz$/i, ''), provenance: 'filename-inferred' },
                    authors: { value: [], provenance: 'filename-inferred' },
                    genres: { value: [], provenance: 'filename-inferred' },
                    originalFilename: file.fileName,
                    sourceFormat: 'cbz',
                    fileSizeBytes: file.fileSizeBytes,
                    coverInfo: {
                        resourceId: documentId
                    }
                },
                resources: {},
                toc: toc.length > 0 ? toc : undefined
            };

            const binaryArtifact: ImportArtifact = {
                kind: 'document-binary',
                id: documentId
            };

            return {
                status: 'success',
                document: doc,
                artifacts: [coverArtifact, binaryArtifact]
            };

        } catch (error: any) {
            if (documentId) {
                await this.storage.deleteDocument(documentId).catch(err => {
                    console.error('Failed to cleanup CBZ binary during failed import:', err);
                });
            }
            return {
                status: 'failure',
                error: {
                    code: 'IMPORT_ERROR',
                    message: 'An unexpected error occurred during CBZ import',
                    details: error.message
                }
            };
        }
    }

    private async getImageDimensions(blob: Blob): Promise<{width: number, height: number}> {
        if (typeof createImageBitmap !== 'undefined') {
            try {
                const bmp = await createImageBitmap(blob);
                const { width, height } = bmp;
                bmp.close();
                return { width, height };
            } catch (e) {
                return { width: 800, height: 1200 };
            }
        } else if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
            return new Promise((resolve) => {
                const img = new Image();
                const url = URL.createObjectURL(blob);
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve({ width: img.naturalWidth, height: img.naturalHeight });
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve({ width: 800, height: 1200 }); // fallback
                };
                img.src = url;
            });
        }
        return { width: 800, height: 1200 }; // Test environment fallback
    }
}
