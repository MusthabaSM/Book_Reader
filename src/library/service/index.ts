import type { LibraryBook, ReadingProgress, FileReference, LibraryQueryOptions } from '../models';
import type { ImporterRegistry } from '../../formats/importers/registry';
import type { FileInput } from '../../formats/models';
import type { DocumentContent, TocEntry } from '../../book/models';
import type { FixedDocument, FixedDocumentPage } from '../../book/models/fixed';
import type { 
    BookRepository, 
    BookContentRepository,
    DocumentStorageRepository,
    CoverStorageRepository,
    CoverArtifact
} from '../repository';
import type { FormatDetector } from '../../formats/detector';
import { validateImageUpload } from '../utils/image-validator';

export interface BookMetadataUpdates {
    title?: string;
    authors?: string[];
    genres?: string[];
    publicationYear?: number | null;
    isFavorite?: boolean;
    seriesTitle?: string;
}

export class LibraryService {
    private importerRegistry: ImporterRegistry;
    private formatDetector: FormatDetector;
    private bookRepository: BookRepository;
    private contentRepository: BookContentRepository;
    private documentStorage: DocumentStorageRepository;
    private coverStorage: CoverStorageRepository;

    constructor(
        importerRegistry: ImporterRegistry,
        formatDetector: FormatDetector,
        bookRepository: BookRepository,
        contentRepository: BookContentRepository,
        documentStorage: DocumentStorageRepository,
        coverStorage: CoverStorageRepository
    ) {
        this.importerRegistry = importerRegistry;
        this.formatDetector = formatDetector;
        this.bookRepository = bookRepository;
        this.contentRepository = contentRepository;
        this.documentStorage = documentStorage;
        this.coverStorage = coverStorage;
    }

    /**
     * Imports a book from a raw file input, extracts metadata, 
     * handles duplicate detection, and persists it to the library.
     */
    public async importBook(file: FileInput, fileRef: FileReference, force: boolean = false): Promise<LibraryBook> {
        if (!force) {
            // Duplicate Policy (Phase 9): Reject strictly matching file references
            const existing = await this.bookRepository.findByFileReference(fileRef);
            if (existing) {
                throw new Error('DUPLICATE_FILE_REF: This exact file reference is already in the library.');
            }
        }

        // 1. Detect format using FormatDetector
        const detection = await this.formatDetector.detect(file);
        
        console.log('--- DIAGNOSTIC LOG: Format Detection ---');
        console.log('File Name:', file.fileName);
        console.log('File Ext:', file.extension);
        console.log('File MIME:', file.mimeType);
        console.log('Detected Format:', detection.format);
        console.log('Detection Confidence:', detection.confidence);
        console.log('----------------------------------------');

        const importer = this.importerRegistry.getImporterForFormat(detection.format);

        console.log('--- DIAGNOSTIC LOG: Registry Resolution ---');
        console.log('Format ID Requested:', detection.format);
        console.log('Importer Resolved:', importer?.constructor.name);
        console.log('-------------------------------------------');

        if (!importer) {
            throw new Error(`UNSUPPORTED_FORMAT: No importer found for ${detection.format}`);
        }

        if (!(await importer.canImport(file))) {
            throw new Error(`IMPORT_REJECTED: Importer rejected file ${file.fileName}`);
        }

        // 2. Import Content (this must return the Universal Book Model)
        const importResult = await importer.import(file);
        if (importResult.status === 'failure') {
            if (importResult.error.details) {
                console.error('--- IMPORT FAILURE DETAILS ---');
                console.error(JSON.stringify(importResult.error.details, null, 2));
            }
            throw new Error(`IMPORT_FAILED: ${importResult.error.code} - ${importResult.error.message}`);
        }

        const document = importResult.document;
        const artifacts = importResult.status === 'partial_success' || importResult.status === 'success' 
            ? importResult.artifacts || [] 
            : [];

        // Note: At this stage, we have the complete Document Content, but we haven't stored it yet.
        // We will now check if there's a title/author duplicate based on the extracted metadata.
        // We do this by listing existing books and comparing (since we don't have SQL yet).
        if (!force) {
            const possibleDuplicates = await this.bookRepository.list({
                searchQuery: document.metadata.title.value
            });
            const isExactMatch = possibleDuplicates.some(dup => 
                dup.title === document.metadata.title.value && 
                dup.authors.some(da => document.metadata.authors.value.some(ba => ba.displayName === da.displayName))
            );
            if (isExactMatch) {
                // If it's a title + author match, it might be the same book. We throw a warning.
                // The caller can catch this and re-call with force=true to allow multiple editions.
                throw new Error('DUPLICATE_METADATA: A book with this title and author already exists.');
            }
        }

        // 3. Store the Document content JSON
        await this.contentRepository.store(document);
        
        // 4. Store the cover if present
        for (const artifact of artifacts) {
            if (artifact.kind === 'cover-image') {
                try {
                    await this.coverStorage.storeCover(document.id, artifact);
                } catch (e) {
                    console.warn(`Failed to store cover for ${document.id}. Continuing import.`, e);
                }
            }
        }

        const libBook: LibraryBook = {
            id: `lib-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
            bookId: document.id,
            title: document.metadata.title.value,
            authors: document.metadata.authors.value,
            genres: document.metadata.genres.value,
            publicationYear: document.metadata.publicationYear?.value,
            sourceFormat: document.metadata.sourceFormat,
            fileReference: fileRef,
            fileSizeBytes: document.metadata.fileSizeBytes,
            dateAdded: Date.now(),
            coverResourceId: document.metadata.coverInfo?.resourceId
        };

        try {
            await this.bookRepository.add(libBook);
        } catch (error) {
            // Application-level compensation: if SQL metadata write fails,
            // we must clean up the orphaned JSON content to prevent storage leaks.
            await this.contentRepository.delete(document.id).catch(cleanupError => {
                console.error('Failed to cleanup orphaned content after metadata write failure:', cleanupError);
            });
            
            // Generic artifact cleanup based on what the importer told us it stored
            for (const artifact of artifacts) {
                if (artifact.kind === 'document-binary') {
                    await this.documentStorage.deleteDocument(artifact.id).catch(err => {
                        console.error('Failed to cleanup document binary artifact:', err);
                    });
                } else if (artifact.kind === 'cover-image') {
                    await this.coverStorage.deleteCover(document.id).catch(err => {
                        console.error('Failed to cleanup cover artifact:', err);
                    });
                }
            }

            throw error;
        }

        return libBook;
    }

    /**
     * Imports multiple CBZ files and groups them into a single virtual book.
     */
    public async importCbzGroup(files: FileInput[], groupTitle: string, groupFileRef: FileReference): Promise<LibraryBook> {
        if (files.length === 0) throw new Error('No files provided');
        
        const importer = this.importerRegistry.getImporterForFormat('cbz');
        if (!importer) throw new Error('CBZ importer not found');

        const documents: FixedDocument[] = [];
        const allArtifacts: CoverArtifact[] = [];
        const sourceIds: string[] = [];

        // 1. Import each file individually to extract content and artifacts
        for (const file of files) {
            if (!(await importer.canImport(file))) {
                throw new Error(`File ${file.fileName} cannot be imported as CBZ`);
            }
            const result = await importer.import(file);
            if (result.status === 'failure') {
                throw new Error(`Failed to import ${file.fileName}: ${result.error.message}`);
            }
            if (result.document.type !== 'fixed') {
                throw new Error(`Expected fixed document from CBZ importer for ${file.fileName}`);
            }
            
            documents.push(result.document);
            sourceIds.push(result.document.documentSourceId);
            
            const coverArtifact = result.artifacts?.find(a => a.kind === 'cover-image');
            if (coverArtifact) allArtifacts.push(coverArtifact as CoverArtifact);
        }

        // 2. Stitch documents together
        const mergedPages: FixedDocumentPage[] = [];
        const mergedToc: TocEntry[] = [];
        let globalPageIndex = 0;
        let totalSize = 0;

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const fileTitle = doc.metadata.title.value;
            totalSize += doc.metadata.fileSizeBytes;

            // Shift page indices
            const shiftedPages = doc.pages.map(p => ({
                ...p,
                pageIndex: p.pageIndex + globalPageIndex
            }));
            mergedPages.push(...shiftedPages);

            // Shift TOC entries
            const shiftToc = (entries: TocEntry[], offset: number): TocEntry[] => {
                return entries.map(e => ({
                    ...e,
                    targetPageIndex: e.targetPageIndex !== undefined ? e.targetPageIndex + offset : undefined,
                    children: e.children ? shiftToc(e.children, offset) : undefined
                }));
            };

            const rootTocEntry: TocEntry = {
                title: fileTitle,
                targetPageIndex: globalPageIndex,
                children: doc.toc ? shiftToc(doc.toc, globalPageIndex) : []
            };
            mergedToc.push(rootTocEntry);

            globalPageIndex += doc.pages.length;
        }

        const mergedDocumentId = `cbzgroup-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const mergedDocument: FixedDocument = {
            type: 'fixed',
            id: mergedDocumentId,
            documentSourceId: `MULTI:${sourceIds.join(',')}`,
            pageCount: mergedPages.length,
            pages: mergedPages,
            metadata: {
                title: { value: groupTitle, provenance: 'user-edited' },
                authors: { value: [], provenance: 'filename-inferred' },
                genres: { value: [], provenance: 'filename-inferred' },
                originalFilename: 'Multiple Files',
                sourceFormat: 'cbz',
                fileSizeBytes: totalSize,
                coverInfo: { resourceId: mergedDocumentId }
            },
            resources: {},
            toc: mergedToc
        };

        // 3. Store merged content
        await this.contentRepository.store(mergedDocument);

        // 4. Store cover (just use the first volume's cover)
        if (allArtifacts.length > 0) {
            try {
                await this.coverStorage.storeCover(mergedDocumentId, allArtifacts[0]);
            } catch (e) {
                console.warn(`Failed to store group cover`, e);
            }
        }

        const libBook: LibraryBook = {
            id: `lib-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
            bookId: mergedDocumentId,
            title: groupTitle,
            authors: [],
            genres: [],
            sourceFormat: 'cbz',
            fileReference: groupFileRef,
            fileSizeBytes: totalSize,
            dateAdded: Date.now(),
            coverResourceId: mergedDocumentId
        };

        try {
            await this.bookRepository.add(libBook);
        } catch (error) {
            await this.contentRepository.delete(mergedDocumentId).catch(console.error);
            throw error;
        }

        return libBook;
    }

    /**
     * Lists library records.
     */
    public async listBooks(options?: LibraryQueryOptions): Promise<LibraryBook[]> {
        return this.bookRepository.list(options);
    }

    /**
     * Retrieves a library record.
     */
    public async getLibraryBook(id: string): Promise<LibraryBook | null> {
        return this.bookRepository.get(id);
    }

    /**
     * Retrieves the cover source for a library record.
     */
    public async getCoverSource(libraryBookId: string) {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (!libBook) return null;
        return this.coverStorage.getCoverSource(libBook.bookId);
    }

    /**
     * Retrieves the Universal Book Model or Fixed Document and marks the library record as opened.
     */
    public async openBook(libraryBookId: string): Promise<{ libraryBook: LibraryBook, bookContent: DocumentContent }> {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (!libBook) {
            throw new Error('BOOK_NOT_FOUND_IN_LIBRARY');
        }

        const bookContent = await this.contentRepository.get(libBook.bookId);
        if (!bookContent) {
            throw new Error('BOOK_CONTENT_NOT_FOUND');
        }

        libBook.dateLastOpened = Date.now();
        await this.bookRepository.update(libraryBookId, { dateLastOpened: libBook.dateLastOpened });

        return { libraryBook: libBook, bookContent };
    }

    /**
     * Updates reading progress for a book.
     */
    public async updateReadingProgress(libraryBookId: string, progress: ReadingProgress): Promise<void> {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (libBook) {
            await this.bookRepository.update(libraryBookId, { readingProgress: progress });
        }
    }

    /**
     * Updates metadata for a book (Title, Authors, Publication Year)
     */
    public async updateBookMetadata(libraryBookId: string, updates: BookMetadataUpdates): Promise<LibraryBook> {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (!libBook) {
            throw new Error('BOOK_NOT_FOUND_IN_LIBRARY');
        }

        const partialUpdate: Partial<LibraryBook> = {};

        if (updates.title !== undefined) {
            const trimmed = updates.title.trim();
            if (trimmed === '') throw new Error('Title cannot be empty');
            partialUpdate.title = trimmed;
        }

        if (updates.publicationYear !== undefined) {
            if (updates.publicationYear !== null && (!Number.isInteger(updates.publicationYear) || updates.publicationYear < 1000 || updates.publicationYear > 3000)) {
                throw new Error('Invalid publication year');
            }
            (partialUpdate as any).publicationYear = updates.publicationYear === null ? null : updates.publicationYear;
        }

        if (updates.authors !== undefined) {
            // Very simple mapping for phase 10: we just recreate Author objects.
            const newAuthors = updates.authors
                .map(name => name.trim())
                .filter(name => name.length > 0)
                .map(name => ({ id: `author-${Date.now()}-${Math.random()}`, displayName: name }));
            
            partialUpdate.authors = newAuthors as any; // Type assertion since LibraryBook Author interface expects strict structure.
        }

        if (updates.genres !== undefined) {
            const newGenres = updates.genres
                .map(name => name.trim())
                .filter(name => name.length > 0)
                .map(name => ({ id: `genre-${Date.now()}-${Math.random()}`, name }));
            
            partialUpdate.genres = newGenres as any;
        }

        if (updates.isFavorite !== undefined) {
            partialUpdate.isFavorite = updates.isFavorite;
        }
        
        if (updates.seriesTitle !== undefined) {
            partialUpdate.seriesTitle = updates.seriesTitle;
        }

        if (Object.keys(partialUpdate).length > 0) {
            await this.bookRepository.update(libraryBookId, partialUpdate);
        }
        
        const updatedBook = await this.bookRepository.get(libraryBookId);
        if (!updatedBook) throw new Error('Failed to retrieve updated book');
        return updatedBook;
    }

    /**
     * Replaces the cover image of an existing book.
     */
    public async updateBookCover(libraryBookId: string, artifact: Pick<CoverArtifact, 'data'>): Promise<LibraryBook> {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (!libBook) {
            throw new Error('BOOK_NOT_FOUND_IN_LIBRARY');
        }

        const validation = validateImageUpload(artifact.data);
        if (!validation.valid || !validation.mimeType) {
            throw new Error(validation.error || 'Invalid image format.');
        }

        const fullArtifact: CoverArtifact = {
            data: artifact.data,
            mimeType: validation.mimeType
        };

        const newCoverResourceId = `cover-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        // Hold previous cover in memory for rollback
        let previousCoverArtifact: CoverArtifact | null = null;
        try {
            const oldSource = await this.coverStorage.getCoverSource(libBook.bookId);
            if (oldSource && oldSource.url) {
                const response = await fetch(oldSource.url);
                const arrayBuffer = await response.arrayBuffer();
                const mimeType = response.headers.get('content-type') || 'application/octet-stream';
                previousCoverArtifact = {
                    data: new Uint8Array(arrayBuffer),
                    mimeType
                };
            }
        } catch (e) {
            console.warn('Failed to backup previous cover for rollback', e);
        }

        // 1. Store the new cover under the same book ID
        try {
            await this.coverStorage.storeCover(libBook.bookId, fullArtifact);
        } catch (error: any) {
            throw new Error(`Failed to store cover: ${error.message}`);
        }

        // 2. Update the library book metadata
        try {
            await this.bookRepository.update(libraryBookId, { coverResourceId: newCoverResourceId });
        } catch (error: any) {
            // Rollback: restore previous cover if we had one, otherwise delete the new one
            try {
                if (previousCoverArtifact) {
                    await this.coverStorage.storeCover(libBook.bookId, previousCoverArtifact);
                } else {
                    await this.coverStorage.deleteCover(libBook.bookId);
                }
            } catch (rollbackError) {
                console.error('Failed to rollback cover changes:', rollbackError);
            }
            throw new Error(`Failed to update book metadata: ${error.message}`);
        }

        const updatedBook = await this.bookRepository.get(libraryBookId);
        if (!updatedBook) throw new Error('Failed to retrieve updated book');
        return updatedBook;
    }

    /**
     * Deletes a book entirely from the library and content storage.
     */
    public async removeBook(libraryBookId: string): Promise<void> {
        const libBook = await this.bookRepository.get(libraryBookId);
        if (!libBook) return;

        await this.bookRepository.delete(libraryBookId);
        await this.contentRepository.delete(libBook.bookId).catch(err => {
            console.error(`Failed to delete book content for ${libBook.bookId}:`, err);
        });

        if (libBook.fileReference) {
            await this.documentStorage.deleteDocument(libBook.fileReference).catch(err => {
                console.error(`Failed to delete document binary for ${libBook.fileReference}:`, err);
            });
        }
        
        await this.coverStorage.deleteCover(libBook.bookId).catch(err => {
            console.error(`Failed to delete cover for ${libBook.bookId}:`, err);
        });
    }

    /**
     * Retrieves the document source for fixed layouts.
     */
    public async getDocumentSource(documentSourceId: string) {
        return this.documentStorage.getDocumentSource(documentSourceId);
    }
}
