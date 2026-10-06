import JSZip from 'jszip';
import type { BookImporter, FileInput, ImportResult, ImportArtifact, FormatIdentifier } from '../../models';
import type { Book, Chapter, Resource } from '../../../book/models';
import { getRootfileFromContainer } from './container';
import { parsePackageDocument } from './package';
import { XhtmlParser } from './xhtml-parser';

export class EpubImporter implements BookImporter {
    public supportedFormats: FormatIdentifier[] = ['epub'];

    public async canImport(file: FileInput): Promise<boolean> {
        return file.extension.toLowerCase() === '.epub' || file.mimeType === 'application/epub+zip';
    }

    public async import(file: FileInput): Promise<ImportResult> {
        try {
            let bytes: Uint8Array;
            try {
                bytes = await file.dataSource.readBytes();
            } catch (err) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_READ_ERROR', message: 'Failed to read bytes from dataSource' }
                };
            }

            if (bytes.length === 0) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_EMPTY_FILE', message: 'EPUB file is empty or missing data' }
                };
            }

            let zip: JSZip;
            try {
                // Ensure the file is actually a valid ZIP
                zip = await JSZip.loadAsync(bytes);
            } catch (e) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_INVALID_ZIP', message: 'Input file is not a valid ZIP/EPUB archive' }
                };
            }
            
            const containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_INVALID_CONTAINER', message: 'META-INF/container.xml not found' }
                };
            }

            let containerXml = '';
            try {
                containerXml = await containerFile.async('string');
            } catch (e) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_CONTAINER_READ_ERROR', message: 'Failed to read container.xml' }
                };
            }

            const rootfilePath = getRootfileFromContainer(containerXml);
            if (!rootfilePath) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_INVALID_ROOTFILE', message: 'Valid rootfile not found in container.xml' }
                };
            }

            const opfFile = zip.file(rootfilePath);
            if (!opfFile) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_MISSING_OPF', message: `OPF file ${rootfilePath} not found in archive` }
                };
            }

            const opfXml = await opfFile.async('string');
            const opfPackage = parsePackageDocument(opfXml, rootfilePath);
            
            if (opfPackage.spine.length === 0) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_EMPTY_SPINE', message: 'No readable spine found in OPF' }
                };
            }

            const resources: Record<string, Resource> = {};
            
            for (const item of opfPackage.manifest.values()) {
                if (item.mediaType.startsWith('image/')) {
                    const zipItem = zip.file(item.href);
                    if (zipItem) {
                        try {
                            const base64 = await zipItem.async('base64');
                            resources[item.href] = {
                                id: item.href,
                                type: 'image',
                                mimeType: item.mediaType,
                                url: `data:${item.mediaType};base64,${base64}`
                            };
                        } catch (e) {
                            opfPackage.warnings.push({ code: 'EPUB_RESOURCE_READ_ERROR', message: `Failed to read resource ${item.href}`, level: 'warning' });
                        }
                    } else {
                        opfPackage.warnings.push({ code: 'EPUB_MISSING_RESOURCE', message: `Resource ${item.href} not found in archive`, level: 'warning' });
                    }
                }
            }

            const chapters: Chapter[] = [];
            let chapterCounter = 0;

            for (const spineId of opfPackage.spine) {
                const manifestItem = opfPackage.manifest.get(spineId);
                if (!manifestItem) {
                    opfPackage.warnings.push({ code: 'EPUB_BROKEN_SPINE_REF', message: `Spine references missing manifest item ${spineId}`, level: 'warning' });
                    continue;
                }

                const chapterFile = zip.file(manifestItem.href);
                if (!chapterFile) {
                    opfPackage.warnings.push({ code: 'EPUB_MISSING_CHAPTER', message: `Chapter file ${manifestItem.href} not found in archive`, level: 'warning' });
                    continue;
                }

                try {
                    const xhtml = await chapterFile.async('string');
                    const parser = new XhtmlParser(manifestItem.href, `c${chapterCounter}`);
                    const blocks = parser.parse(xhtml);
                    
                    chapters.push({
                        id: `c${chapterCounter}`,
                        orderNumber: chapterCounter,
                        blocks
                    });
                    chapterCounter++;
                } catch (e: any) {
                    opfPackage.warnings.push({ code: 'EPUB_CHAPTER_PARSE_ERROR', message: `Failed to parse chapter ${manifestItem.href}: ${e.message}`, level: 'warning' });
                }
            }

            if (chapters.length === 0) {
                return {
                    status: 'failure',
                    error: { code: 'EPUB_NO_USABLE_CONTENT', message: 'No chapters could be successfully extracted from spine' }
                };
            }

            const book: Book = {
                type: 'reflowable',
                id: `book-epub-${Date.now()}`,
                metadata: {
                    title: { value: opfPackage.metadata.title, provenance: 'file-extracted' },
                    authors: { 
                        value: opfPackage.metadata.creator.map((name, i) => ({ id: `a${i}`, displayName: name })), 
                        provenance: 'file-extracted' 
                    },
                    genres: { value: [], provenance: 'file-extracted' },
                    originalFilename: file.fileName,
                    sourceFormat: 'epub',
                    fileSizeBytes: file.fileSizeBytes
                },
                chapters,
                resources
            };

            let artifacts: ImportArtifact[] = [];

            if (opfPackage.metadata.coverId) {
                const coverItem = opfPackage.manifest.get(opfPackage.metadata.coverId);
                if (coverItem && resources[coverItem.href]) {
                    book.metadata.coverInfo = { resourceId: coverItem.href };
                    
                    const coverRes = resources[coverItem.href];
                    let base64 = '';
                    if (coverRes.url.startsWith('data:')) {
                        base64 = coverRes.url.split(',')[1];
                    }
                    const rawData = atob(base64);
                    const bytes = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; i++) {
                        bytes[i] = rawData.charCodeAt(i);
                    }

                    artifacts.push({
                        kind: 'cover-image',
                        id: coverItem.href,
                        data: bytes,
                        mimeType: coverRes.mimeType || 'image/jpeg'
                    });
                }
            }

            if (opfPackage.warnings.length > 0) {
                return {
                    status: 'partial_success',
                    document: book,
                    warnings: opfPackage.warnings,
                    artifacts
                };
            }

            return {
                status: 'success',
                document: book,
                artifacts
            };

        } catch (e: any) {
            return {
                status: 'failure',
                error: {
                    code: 'EPUB_IMPORT_ERROR',
                    message: e.message || 'Unknown error occurred during EPUB import'
                }
            };
        }
    }
}
