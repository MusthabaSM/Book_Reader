import { SQLiteBookRepository } from '../repository/tauri-sqlite';
import { TauriBookContentRepository } from '../repository/tauri-content';
import { BrowserCoverStorageRepository } from '../repository/browser-cover';
import { LibraryService } from '../service';
import { ImporterRegistry } from '../../formats/importers/registry';
import { FormatDetector } from '../../formats/detector';
import { MockFileDataSource } from '../../formats/__tests__/mock-data-source';
import { Paginator } from '../../pagination/paginator';
import { BrowserTextMeasurer } from '../../pagination/layout/browser-measurer';
import { defaultPaginationConfig } from '../../pagination/layout/config';
import type { FileInput, BookImporter, ImportResult, FormatIdentifier } from '../../formats/models';
import type { Book, Chapter, ParagraphBlock } from '../../book/models';

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

        const book: Book = {
            type: 'reflowable',
            id: `book-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
        };

        return { status: 'success', document: book };
    }
}

class MockFixedImporter implements BookImporter {
    public supportedFormats: FormatIdentifier[] = ['mockpdf' as FormatIdentifier];
    public async canImport(file: FileInput): Promise<boolean> { return file.extension === '.mockpdf'; }
    public async import(file: FileInput): Promise<ImportResult> {
        return {
            status: 'success',
            document: {
                type: 'fixed',
                id: `fixed-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                documentSourceId: 'opaque-123',
                metadata: {
                    title: { value: 'Fixed Book', provenance: 'file-extracted' },
                    authors: { value: [], provenance: 'file-extracted' },
                    genres: { value: [], provenance: 'file-extracted' },
                    originalFilename: file.fileName,
                    sourceFormat: 'pdf',
                    fileSizeBytes: file.fileSizeBytes
                },
                pages: [],
                resources: {}
            } as any
        };
    }
}

function createMockTxtFile(name: string, content: string): FileInput {
    return {
        fileName: name,
        extension: '.mocktxt',
        mimeType: 'text/mocktxt',
        fileSizeBytes: content.length,
        dataSource: new MockFileDataSource(content)
    };
}

export async function runTauriPersistenceTest(): Promise<string[]> {
    const logs: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    try {
        log('Starting Tauri Persistence E2E Test...');

        // 1. Start application/database with temporary test DB
        // We will override the private `getDb` path via a hack or by modifying the repo to accept a db path.
        // For strictness, let's just use the default repo but carefully clean up.
        // Actually, let's modify SQLiteBookRepository to accept an optional db name in the constructor for testing.
        
        const registry = new ImporterRegistry();
        registry.register(new MockImporter());
        registry.register(new MockFixedImporter());
        const formatDetector = new FormatDetector();
        formatDetector.registerFormat('.mocktxt', 'text/mocktxt', 'mocktxt' as FormatIdentifier);
        formatDetector.registerFormat('.mockpdf', 'application/mockpdf', 'mockpdf' as FormatIdentifier);

        log('Initializing Repository Instance A...');
        let bookRepoA = new SQLiteBookRepository('sqlite:test_library.db');
        await bookRepoA.initialize();
        
        let contentRepoA = new TauriBookContentRepository('test_book_content');

        let docStorageA = new (await import('../repository/browser-document')).BrowserDocumentStorageRepository();
        const coverStorageA = new BrowserCoverStorageRepository();
        let libraryA = new LibraryService(registry, formatDetector, bookRepoA, contentRepoA, docStorageA, coverStorageA);

        // Clear previous test data
        const existingBooks = await libraryA.listBooks();
        for (const b of existingBooks) {
            await libraryA.removeBook(b.id);
        }

        // 2. Import synthetic book
        log('Importing synthetic book...');
        const file = createMockTxtFile('test_persist.mocktxt', 'Title: Persistence Test\nAuthor: Jane Persist\n\nData must survive!');
        const libBook = await libraryA.importBook(file, 'test-file-ref');
        
        // Import synthetic fixed book
        const fixedFile: FileInput = { fileName: 'fixed.mockpdf', extension: '.mockpdf', mimeType: 'application/mockpdf', fileSizeBytes: 100, dataSource: new MockFileDataSource(new Uint8Array([1,2,3,4])) };
        const libFixedBook = await libraryA.importBook(fixedFile, 'fixed-file-ref');

        // 4. Save reading progress
        log('Saving reading progress...');
        await libraryA.updateReadingProgress(libBook.id, {
            bookId: libBook.bookId,
            position: { type: 'reflowable', bookId: libBook.bookId, chapterId: 'c1', blockId: 'b1', inlineOffset: 10 },
            percentage: 50,
            lastOpenedTimestamp: Date.now()
        });
        
        await libraryA.updateReadingProgress(libFixedBook.id, {
            bookId: libFixedBook.bookId,
            position: { type: 'fixed', bookId: libFixedBook.bookId, pageIndex: 5, x: 10, y: 20 },
            percentage: 25,
            lastOpenedTimestamp: Date.now()
        });

        // 5. Save bookmark (Phase 10 bookmark - we'll just mock it as reading progress for now since bookmarks API isn't fully exposed in LibraryService yet)
        // Wait, the prompt says "Save bookmark." Let's implement a quick bookmark addition via direct repo access for the test.
        log('Saving bookmark...');
        const dbA = await (bookRepoA as any).getDb();
        await dbA.execute(
            `INSERT INTO bookmarks (id, book_id, pos_type, chapter_id, block_id, inline_offset, page_index, pos_x, pos_y, note, created_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            ['bm1', libBook.bookId, 'reflowable', 'c1', 'b1', 10, null, null, null, 'Test Note', Date.now()]
        );
        
        await dbA.execute(
            `INSERT INTO bookmarks (id, book_id, pos_type, chapter_id, block_id, inline_offset, page_index, pos_x, pos_y, note, created_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            ['bm2', libFixedBook.bookId, 'fixed', null, null, null, 7, 100, 200, 'Fixed Note', Date.now()]
        );

        // 6. Close/reinitialize repository
        log('Destroying Instance A, Initializing Instance B...');
        bookRepoA = null as any;
        contentRepoA = null as any;
        libraryA = null as any;

        const bookRepoB = new SQLiteBookRepository('sqlite:test_library.db');
        await bookRepoB.initialize();
        const contentRepoB = new TauriBookContentRepository('test_book_content');
        const docStorageB = new (await import('../repository/browser-document')).BrowserDocumentStorageRepository();
        const coverStorageB = new BrowserCoverStorageRepository();
        const libraryB = new LibraryService(registry, formatDetector, bookRepoB, contentRepoB, docStorageB, coverStorageB);

        // 8. Verify book exists
        log('Verifying data survives...');
        const fetchedBooks = await libraryB.listBooks();
        if (fetchedBooks.length !== 2) throw new Error('Books did not survive reinitialization');

        const survivingBook = fetchedBooks.find(b => b.title === 'Persistence Test')!;
        const survivingFixed = fetchedBooks.find(b => b.title === 'Fixed Book')!;
        
        // 9. Verify metadata exists
        if (survivingBook.title !== 'Persistence Test') throw new Error('Title metadata lost');
        if (survivingBook.authors[0].displayName !== 'Jane Persist') throw new Error('Author metadata lost');

        // 10. Verify reading progress exists
        if (!survivingBook.readingProgress || survivingBook.readingProgress.percentage !== 50) {
            throw new Error('Reading progress lost');
        }
        
        if (!survivingFixed.readingProgress || survivingFixed.readingProgress.position.type !== 'fixed' || (survivingFixed.readingProgress.position as any).pageIndex !== 5) {
            throw new Error('Fixed reading progress lost');
        }

        // 11. Verify bookmark exists
        const dbB = await (bookRepoB as any).getDb();
        const bookmarks = await dbB.select('SELECT * FROM bookmarks WHERE id = $1', ['bm1']);
        if (bookmarks.length !== 1 || bookmarks[0].note !== 'Test Note') {
            throw new Error('Bookmark lost');
        }
        
        const fixedBookmarks = await dbB.select('SELECT * FROM bookmarks WHERE id = $1', ['bm2']);
        if (fixedBookmarks.length !== 1 || fixedBookmarks[0].pos_type !== 'fixed' || fixedBookmarks[0].page_index !== 7) {
            throw new Error('Fixed bookmark lost');
        }

        // 12. Load Book content
        log('Loading Book Content from FS...');
        const { bookContent } = await libraryB.openBook(survivingBook.id);
        if ((bookContent as Book).chapters[0].blocks[0].type !== 'paragraph') {
            throw new Error('Book content corrupted or missing');
        }

        // 13. Pass Book to Paginator
        log('Paginating recovered book...');
        const paginator = new Paginator();
        const result = paginator.paginate(bookContent as Book, defaultPaginationConfig, new BrowserTextMeasurer());

        if (result.pages.length === 0) throw new Error('Pagination failed on recovered book');

        // Clean up
        await libraryB.removeBook(survivingBook.id);
        await libraryB.removeBook(survivingFixed.id);

        log('✅ E2E Persistence Test Passed! Data survived across instances.');
        return logs;

    } catch (e: any) {
        log(`❌ E2E Persistence Test Failed: ${e.message}`);
        throw e;
    }
}
