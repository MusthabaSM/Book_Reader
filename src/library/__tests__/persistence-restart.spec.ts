import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQLiteBookRepository } from '../repository/tauri-sqlite';
import { TauriBookContentRepository } from '../repository/tauri-content';
import type { LibraryBook, Bookmark, ReadingProgress } from '../models';
import type { Book } from '../../book/models';

// Mocks that retain state globally to simulate filesystem/DB persistence across repository instances
const globalDbState = {
    books: [] as any[],
    authors: [] as any[],
    book_authors: [] as any[],
    genres: [] as any[],
    book_genres: [] as any[],
    reading_progress: [] as any[],
    bookmarks: [] as any[]
};

const globalFsState = new Map<string, string>();

vi.mock('@tauri-apps/plugin-sql', () => {
    return {
        default: {
            load: vi.fn().mockResolvedValue({
                execute: vi.fn().mockImplementation(async (query: string, params: any[]) => {
                    if (query.includes('INSERT INTO books')) {
                        globalDbState.books.push({
                            id: params[0], book_id: params[1], title: params[2], 
                            publication_year: params[3], source_format: params[4], 
                            file_reference: params[5], file_size_bytes: params[6], 
                            date_added: params[7], date_last_opened: params[8], cover_resource_id: params[9]
                        });
                    } else if (query.includes('INSERT INTO reading_progress')) {
                        globalDbState.reading_progress.push({
                            book_id: params[0], pos_type: params[1], chapter_id: params[2], block_id: params[3], 
                            inline_offset: params[4], page_index: params[5], pos_x: params[6], pos_y: params[7],
                            percentage: params[8], last_opened_timestamp: params[9]
                        });
                    } else if (query.includes('INSERT INTO bookmarks')) {
                        globalDbState.bookmarks.push({
                            id: params[0], book_id: params[1], pos_type: params[2], chapter_id: params[3], block_id: params[4], 
                            inline_offset: params[5], page_index: params[6], pos_x: params[7], pos_y: params[8],
                            note: params[9], created_timestamp: params[10]
                        });
                    }
                }),
                select: vi.fn().mockImplementation(async (query: string, params: any[]) => {
                    if (query.includes('SELECT * FROM books WHERE id = $1')) {
                        return globalDbState.books.filter(b => b.id === params[0]);
                    } else if (query.includes('SELECT * FROM reading_progress WHERE book_id = $1')) {
                        return globalDbState.reading_progress.filter(p => p.book_id === params[0]);
                    } else if (query.includes('SELECT * FROM bookmarks WHERE book_id = $1')) {
                        return globalDbState.bookmarks.filter(b => b.book_id === params[0]);
                    } else if (query.includes('SELECT a.* FROM authors')) {
                        return [];
                    } else if (query.includes('SELECT g.* FROM genres')) {
                        return [];
                    }
                    return [];
                })
            })
        }
    };
});

vi.mock('@tauri-apps/plugin-fs', () => {
    return {
        BaseDirectory: { AppData: 1 },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeTextFile: vi.fn().mockImplementation(async (path: string, content: string) => {
            globalFsState.set(path, content);
        }),
        readTextFile: vi.fn().mockImplementation(async (path: string) => {
            if (!globalFsState.has(path)) throw new Error('No such file');
            return globalFsState.get(path);
        }),
        remove: vi.fn().mockImplementation(async (path: string) => {
            globalFsState.delete(path);
        }),
        rename: vi.fn().mockImplementation(async (oldPath: string, newPath: string) => {
            if (globalFsState.has(oldPath)) {
                globalFsState.set(newPath, globalFsState.get(oldPath)!);
                globalFsState.delete(oldPath);
            }
        })
    };
});

// Since we use dynamic import for rename
vi.mock('vite', () => ({})); 

describe('Phase 10 Hardening: Persistence Restart Test', () => {
    beforeEach(() => {
        globalDbState.books = [];
        globalDbState.reading_progress = [];
        globalDbState.bookmarks = [];
        globalFsState.clear();
    });

    it('should persist data across different repository instances', async () => {
        // --- Instance A: Write data ---
        const bookRepoA = new SQLiteBookRepository('sqlite:test.db');
        const contentRepoA = new TauriBookContentRepository('book_content');
        
        await bookRepoA.initialize();

        const dummyBook: Book = {
            type: 'reflowable',
            id: 'book-123',
            metadata: {
                title: { value: 'Test Book', provenance: 'file-extracted' },
                authors: { value: [], provenance: 'file-extracted' },
                genres: { value: [], provenance: 'file-extracted' },
                sourceFormat: 'epub',
                originalFilename: 'test.epub',
                fileSizeBytes: 100
            },
            chapters: [],
            resources: {}
        };

        const dummyLibBook: LibraryBook = {
            id: 'lib-1',
            bookId: 'book-123',
            title: 'Test Book',
            authors: [],
            genres: [],
            sourceFormat: 'epub',
            fileReference: 'C:\\test.epub',
            fileSizeBytes: 100,
            dateAdded: 1000
        };

        const dummyProgress: ReadingProgress = {
            bookId: 'book-123',
            position: { type: 'reflowable', bookId: 'book-123', chapterId: 'chap1', blockId: 'blk1', inlineOffset: 10 },
            percentage: 50,
            lastOpenedTimestamp: 2000
        };

        const dummyBookmark: Bookmark = {
            id: 'bm-1',
            bookId: 'book-123',
            position: { type: 'reflowable', bookId: 'book-123', chapterId: 'chap1', blockId: 'blk1', inlineOffset: 5 },
            createdAt: 1500,
            note: 'My note'
        };

        // 1. Save Book Content
        await contentRepoA.store(dummyBook);
        
        // 2. Save LibraryBook
        await bookRepoA.add(dummyLibBook);

        // 3. Save ReadingProgress
        await bookRepoA.update('lib-1', { readingProgress: dummyProgress });

        // 4. Save Bookmark
        await bookRepoA.addBookmark(dummyBookmark);

        // Simulate repository destruction (variables go out of scope)
        
        // --- Instance B: Read data ---
        const bookRepoB = new SQLiteBookRepository('sqlite:test.db');
        const contentRepoB = new TauriBookContentRepository('book_content');

        // 1. Retrieve LibraryBook (includes reading progress)
        const retrievedLibBook = await bookRepoB.get('lib-1');
        expect(retrievedLibBook).toBeDefined();
        expect(retrievedLibBook?.title).toBe('Test Book');
        expect((retrievedLibBook?.readingProgress?.position as any)?.inlineOffset).toBe(10);
        expect((retrievedLibBook?.readingProgress?.position as any)?.chapterId).toBe('chap1');

        // 2. Retrieve Book Content
        const retrievedContent = await contentRepoB.get('book-123');
        expect(retrievedContent).toBeDefined();
        expect(retrievedContent?.metadata.title.value).toBe('Test Book');

        // 3. Retrieve Bookmark
        const retrievedBookmarks = await bookRepoB.getBookmarks('book-123');
        expect(retrievedBookmarks.length).toBe(1);
        expect(retrievedBookmarks[0].id).toBe('bm-1');
        expect(retrievedBookmarks[0].note).toBe('My note');
    });
});
