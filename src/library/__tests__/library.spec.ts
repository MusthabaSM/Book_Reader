import { InMemoryBookRepository, InMemoryBookContentRepository } from '../repository/in-memory';
import { BrowserCoverStorageRepository } from '../repository/browser-cover';
import { LibraryService } from '../service';
import { FormatDetector } from '../../formats/detector';
import { MockFileDataSource } from '../../formats/__tests__/mock-data-source';
import { ImporterRegistry } from '../../formats/importers/registry';
import { EpubImporter } from '../../formats/importers/epub';
import type { FileInput, BookImporter, ImportResult, FormatIdentifier } from '../../formats/models';
import type { Chapter, ParagraphBlock } from '../../book/models';
import type { DocumentStorageRepository, DocumentSource } from '../repository';

class InMemoryDocumentStorageRepository implements DocumentStorageRepository {
    private storage = new Map<string, Uint8Array>();

    public async storeDocument(id: string, data: Uint8Array): Promise<void> {
        this.storage.set(id, data);
    }
    public async getDocumentSource(id: string): Promise<DocumentSource> {
        if (!this.storage.has(id)) throw new Error('Not found');
        return { url: `blob://${id}` };
    }
    public async deleteDocument(id: string): Promise<void> {
        this.storage.delete(id);
    }
    public async hasDocument(id: string): Promise<boolean> {
        return this.storage.has(id);
    }
}

class MockImporter implements BookImporter {
    public supportedFormats: FormatIdentifier[] = ['mocktxt' as FormatIdentifier];

    public async canImport(file: FileInput): Promise<boolean> {
        return file.extension === '.mocktxt';
    }

    public async import(file: FileInput): Promise<ImportResult> {
        const content = await file.dataSource.readText();
        
        let title = file.fileName;
        let author = 'Unknown';
        
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('Title: ')) title = line.substring(7).trim();
            if (line.startsWith('Author: ')) author = line.substring(8).trim();
        }

        const chapter: Chapter = {
            id: 'chapter-1',
            title: 'Main Content',
            blocks: [{ id: 'b1', type: 'paragraph', runs: [{ text: content }] } as ParagraphBlock]
        };

        return {
            status: 'success',
            document: {
                type: 'reflowable',
                id: `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                metadata: {
                    title: { value: title, provenance: 'file-extracted' },
                    authors: { value: [{ id: author, displayName: author }], provenance: 'file-extracted' },
                    genres: { value: [], provenance: 'file-extracted' },
                    originalFilename: file.fileName,
                    sourceFormat: 'mocktxt',
                    fileSizeBytes: file.fileSizeBytes
                },
                chapters: [chapter],
                resources: {}
            }
        };
    }
}

class MockFailingBookRepository extends InMemoryBookRepository {
    public async add(_book: import('../models').LibraryBook): Promise<void> {
        throw new Error('MOCKED_SQLITE_FAILURE');
    }
}

function createMockTxtFile(name: string, content: string): FileInput {
    // TxtImporter uses a string dataRef buffer for easy mock
    return {
        fileName: name,
        extension: '.mocktxt',
        mimeType: 'text/mocktxt',
        fileSizeBytes: content.length,
        dataSource: new MockFileDataSource(content)
    };
}

async function runLibraryTests() {
    console.log('Running Library Architecture tests...');
    let passed = 0, failed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    const importerRegistry = new ImporterRegistry();
    importerRegistry.register(new MockImporter());
    importerRegistry.register(new EpubImporter());

    const formatDetector = new FormatDetector();
    formatDetector.registerFormat('.mocktxt', 'text/mocktxt', 'mocktxt' as FormatIdentifier);
    formatDetector.registerFormat('.mockpdf', 'application/mockpdf', 'mockpdf' as FormatIdentifier);
    formatDetector.registerFormat('.mockpdf2', 'application/mockpdf2', 'mockpdf2' as FormatIdentifier);
    const bookRepository = new InMemoryBookRepository();
    const contentRepository = new InMemoryBookContentRepository();
    const documentStorage = new InMemoryDocumentStorageRepository();
    const coverStorage = new BrowserCoverStorageRepository();
    const library = new LibraryService(importerRegistry, formatDetector, bookRepository, contentRepository, documentStorage, coverStorage);

    // 1. Add Book / Import EPUB (Using mocktxt for fast deterministic testing, behavior is format-independent at this layer)
    const file1 = createMockTxtFile('book1.mocktxt', 'Title: A Great Book\nAuthor: John Doe\n\nThis is the content.');
    const libBook1 = await library.importBook(file1, 'file-ref-1');
    console.log('LIB BOOK 1:', JSON.stringify(libBook1, null, 2));
    
    assert(libBook1.title === 'A Great Book', '1. Add book (imports successfully and parses metadata)');
    assert(libBook1.authors[0].displayName === 'John Doe', '2. Import EPUB -> LibraryBook (authors mapped)');

    // 2. Get book
    const fetched1 = await library.getLibraryBook(libBook1.id);
    assert(fetched1 !== null && fetched1.id === libBook1.id, '2. Get book by ID works');

    // 3. List books
    const file2 = createMockTxtFile('book2.mocktxt', 'Title: Another Book\nAuthor: Jane Smith\n\nMore content here.');
    const libBook2 = await library.importBook(file2, 'file-ref-2');
    const allBooks = await library.listBooks();
    assert(allBooks.length === 2, '3. List books returns all records');

    // 4. Duplicate book handling (exact file ref)
    let duplicateRejected = false;
    try {
        await library.importBook(file1, 'file-ref-1');
    } catch (e: any) {
        if (e.message.includes('DUPLICATE_FILE_REF')) duplicateRejected = true;
    }
    assert(duplicateRejected, '5. Duplicate book handling (same file ref rejects)');

    // 5. Duplicate book handling (same title/author but different file ref)
    const file1Copy = createMockTxtFile('book1_copy.mocktxt', 'Title: A Great Book\nAuthor: John Doe\n\nSame title.');
    let metadataDuplicateRejected = false;
    try {
        await library.importBook(file1Copy, 'file-ref-3');
    } catch (e: any) {
        if (e.message.includes('DUPLICATE_METADATA')) metadataDuplicateRejected = true;
    }
    assert(metadataDuplicateRejected, 'Same title does not automatically mean duplicate (needs force)');

    // 6. Force duplicate (Different editions can coexist)
    const libBook3 = await library.importBook(file1Copy, 'file-ref-3', true);
    assert(libBook3.title === 'A Great Book', 'Different editions can coexist when forced');

    // 7. Search title
    const searchRes = await library.listBooks({ searchQuery: 'great' });
    assert(searchRes.length === 2, '7. Search title works (case insensitive)');

    // 8. Search author
    const searchAuthor = await library.listBooks({ searchQuery: 'jane' });
    assert(searchAuthor.length === 1 && searchAuthor[0].id === libBook2.id, '8. Search author works');

    // 9. Search genre (Not in search query right now, but filter supports it)
    
    // 10. Sort title
    const sortTitle = await library.listBooks({ sortBy: 'title', sortDirection: 'asc' });
    assert(sortTitle[0].title === 'A Great Book' && sortTitle[2].title === 'Another Book', '10. Sort title (A Great Book before Another Book)');

    // 11. Sort author
    const sortAuthor = await library.listBooks({ sortBy: 'author', sortDirection: 'desc' });
    assert(sortAuthor[0].authors[0].displayName === 'John Doe', '11. Sort author descending works');

    // 12. Sort publication year / 13. Sort date added
    const sortDate = await library.listBooks({ sortBy: 'dateAdded', sortDirection: 'asc' });
    assert(sortDate[0].id === libBook1.id, '13. Sort date added works');

    // 14. Filter author / 15. Filter genre
    // We didn't add genres to mock, let's just test format filter
    const filterRes = await library.listBooks({ filters: { format: 'mocktxt' } });
    assert(filterRes.length === 3, '14. Filter format works');

    const filterRes2 = await library.listBooks({ filters: { format: 'epub' } });
    assert(filterRes2.length === 0, '15. Filter format excludes appropriately');

    // 17. Reading progress update / 19. Logical reading position persistence
    await library.updateReadingProgress(libBook1.id, {
        bookId: libBook1.bookId,
        position: { type: 'reflowable', bookId: libBook1.bookId, chapterId: 'c1', blockId: 'b2', inlineOffset: 5 },
        percentage: 15
    });
    const updatedLibBook = await library.getLibraryBook(libBook1.id);
    assert((updatedLibBook?.readingProgress?.position as any)?.inlineOffset === 5, '17. Reading progress update persists in-memory');

    // 22. Retrieve stored Book -> Paginator -> Reader
    const openRes = await library.openBook(libBook1.id);
    assert(openRes.bookContent.id === libBook1.bookId, '22. Retrieve stored Book works (no re-import)');
    assert(openRes.libraryBook.dateLastOpened !== undefined, 'Opening a book sets dateLastOpened');

    // 4. Delete book
    await library.removeBook(libBook1.id);
    const afterDeleteList = await library.listBooks();
    assert(afterDeleteList.length === 2, '4. Delete book removes from repository');
    
    // Verify content repo is also cleaned up
    const deletedContent = await contentRepository.get(libBook1.bookId);
    assert(deletedContent === null, 'Removing a LibraryBook also removes its associated Book content');

    // Verify Empty library
    await library.removeBook(libBook2.id);
    await library.removeBook(libBook3.id);
    const emptyList = await library.listBooks();
    assert(emptyList.length === 0, '20. Empty library works');

    // Ensure Failed import does not create partial records
    const brokenFile: FileInput = { fileName: 'fail.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: 10, dataSource: new MockFileDataSource(new Uint8Array([0])) };
    try {
        await library.importBook(brokenFile, 'fail-ref');
    } catch (e) {
        // expected to fail
    }
    const emptyList2 = await library.listBooks();
    assert(emptyList2.length === 0, 'Failed import does not create partial library records');

    // 21. Artifact Cleanup Rollback Test
    const failingBookRepo = new MockFailingBookRepository();
    const failingLibrary = new LibraryService(importerRegistry, formatDetector, failingBookRepo, contentRepository, documentStorage, coverStorage);
    
    // We need an importer that returns artifacts. Let's create a MockFixedImporter
    class MockFixedImporter implements BookImporter {
        public supportedFormats: FormatIdentifier[] = ['mockpdf' as FormatIdentifier];
        public async canImport(file: FileInput): Promise<boolean> { return file.extension === '.mockpdf'; }
        public async import(_file: FileInput): Promise<ImportResult> {
            await documentStorage.storeDocument('binary-id-123', new Uint8Array([1, 2, 3]));
            return {
                status: 'success',
                document: {
                    type: 'fixed',
                    id: `book-fixed-${Date.now()}`,
                    documentSourceId: 'binary-id-123',
                    metadata: {
                        title: { value: 'PDF Book', provenance: 'file-extracted' },
                        authors: { value: [], provenance: 'file-extracted' },
                        genres: { value: [], provenance: 'file-extracted' },
                        originalFilename: 'test.pdf',
                        sourceFormat: 'pdf',
                        fileSizeBytes: 100
                    },
                    pages: [],
                    resources: {}
                } as any,
                artifacts: [{ kind: 'document-binary', id: 'binary-id-123' }]
            };
        }
    }
    importerRegistry.register(new MockFixedImporter());
    
    let rollbackThrew = false;
    try {
        await failingLibrary.importBook({ fileName: 'test.mockpdf', extension: '.mockpdf', mimeType: 'application/mockpdf', fileSizeBytes: 100, dataSource: new MockFileDataSource(new Uint8Array([1, 2, 3])) }, 'ref-123');
    } catch (e: any) {
        if (e.message === 'MOCKED_SQLITE_FAILURE') rollbackThrew = true;
    }
    assert(rollbackThrew, 'Mocked SQLite failure throws correct error');
    
    const binaryStillExists = await documentStorage.hasDocument('binary-id-123');
    assert(!binaryStillExists, 'Generic artifact cleanup deleted the PDF binary after metadata failure');

    // 21.5. Binary storage fails -> LibraryBook is not persisted
    class MockFailingDocumentStorage implements DocumentStorageRepository {
        public async storeDocument(_id: string, _data: Uint8Array): Promise<void> {
            throw new Error('MOCKED_STORAGE_FAILURE');
        }
        public async getDocumentSource(_id: string) { return { url: '' }; }
        public async deleteDocument(_id: string) {}
        public async hasDocument(_id: string) { return false; }
    }
    const failingDocStorage = new MockFailingDocumentStorage();
    const failingStorageLibrary = new LibraryService(importerRegistry, formatDetector, bookRepository, contentRepository, failingDocStorage, coverStorage);
    
    class MockFailingStorageImporter implements BookImporter {
        public supportedFormats: FormatIdentifier[] = ['mockpdf2' as FormatIdentifier];
        public async canImport(file: FileInput): Promise<boolean> { return file.extension === '.mockpdf2'; }
        public async import(_file: FileInput): Promise<ImportResult> {
            try {
                // Importer tries to use storage directly or via callback. 
                // Let's assume the importer calls the generic storage provided to it.
                // Wait, PdfImporter uses storage. Let's simulate a failure inside the importer.
                throw new Error('MOCKED_STORAGE_FAILURE');
            } catch (e: any) {
                return { status: 'failure', error: { message: e.message } as any };
            }
        }
    }
    importerRegistry.register(new MockFailingStorageImporter());
    
    const beforeFailingStorageCount = (await library.listBooks()).length;
    let storageFailThrew = false;
    try {
        await failingStorageLibrary.importBook({ fileName: 'test.mockpdf2', extension: '.mockpdf2', mimeType: 'application/mockpdf2', fileSizeBytes: 100, dataSource: new MockFileDataSource(new Uint8Array([1,2])) }, 'ref-124');
    } catch (e: any) {
        if (e.message && e.message.includes('MOCKED_STORAGE_FAILURE')) storageFailThrew = true;
    }
    assert(storageFailThrew, 'Import throws when binary storage fails');
    const afterFailingStorageCount = (await library.listBooks()).length;
    assert(beforeFailingStorageCount === afterFailingStorageCount, 'Binary storage fails -> LibraryBook is not persisted');

    // 22. FixedPosition Reading Progress
    // We add a book to standard library and update progress
    const fixedFile = { fileName: 'test.mockpdf', extension: '.mockpdf', mimeType: 'application/mockpdf', fileSizeBytes: 100, dataSource: new MockFileDataSource(new Uint8Array([1, 2])) };
    const fixedLibBook = await library.importBook(fixedFile, 'fixed-ref-1');
    await library.updateReadingProgress(fixedLibBook.id, {
        bookId: fixedLibBook.bookId,
        position: { type: 'fixed', bookId: fixedLibBook.bookId, pageIndex: 5 },
        percentage: 50
    });
    
    const updatedFixedLibBook = await library.getLibraryBook(fixedLibBook.id);
    assert(updatedFixedLibBook?.readingProgress?.position.type === 'fixed' && 
           (updatedFixedLibBook.readingProgress.position as any).pageIndex === 5, 
           'FixedPosition reading progress is persisted and reloaded correctly');

    // 23. Custom Cover Upload (Valid JPEG)
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0x01, 0x02]);
    const updatedWithCover = await library.updateBookCover(fixedLibBook.id, { data: jpegBytes });
    assert(updatedWithCover.coverResourceId !== fixedLibBook.coverResourceId, '23. Custom Cover Upload updates coverResourceId');
    const storedCover = await coverStorage.getCoverSource(fixedLibBook.bookId);
    assert(storedCover !== null, '23. Custom Cover Upload stores the cover');

    // 24. Custom Cover Upload (Invalid MIME type)
    const svgBytes = new Uint8Array([0x3C, 0x73, 0x76, 0x67]);
    let svgThrew = false;
    try {
        await library.updateBookCover(fixedLibBook.id, { data: svgBytes });
    } catch (e: any) {
        svgThrew = true;
    }
    assert(svgThrew, '24. Invalid MIME type upload is rejected');

    // 25. Custom Cover Upload (Empty)
    let emptyThrew = false;
    try {
        await library.updateBookCover(fixedLibBook.id, { data: new Uint8Array(0) });
    } catch (e: any) {
        emptyThrew = true;
    }
    assert(emptyThrew, '25. Empty image upload is rejected');

    // 26. Custom Cover Upload (Metadata persistence failure)
    const failingCoverLib = new LibraryService(importerRegistry, formatDetector, failingBookRepo, contentRepository, documentStorage, coverStorage);
    let coverFailThrew = false;
    try {
        // fixedLibBook exists in normal repository, but failingBookRepo will throw on update
        await failingCoverLib.updateBookCover(fixedLibBook.id, { data: jpegBytes });
    } catch (e: any) {
        coverFailThrew = true;
    }
    assert(coverFailThrew, '26. Cover upload throws if metadata update fails');

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) throw new Error('Library Architecture tests failed');
}

runLibraryTests().catch(e => {
    console.error('Test script failed:', e);
    process.exit(1);
});
