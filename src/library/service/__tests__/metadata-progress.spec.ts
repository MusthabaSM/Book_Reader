import { describe, it, expect, beforeEach } from 'vitest';
import { LibraryService } from '../index';
import { InMemoryBookRepository } from '../../repository/in-memory';
import { TauriBookContentRepository } from '../../repository/tauri-content';
import { BrowserDocumentStorageRepository } from '../../repository/browser-document';
import { BrowserCoverStorageRepository } from '../../repository/browser-cover';
import { FormatDetector } from '../../../formats/detector';
import { ImporterRegistry } from '../../../formats/importers/registry';
import type { LibraryBook } from '../../models';

// We mock the content repositories since they are mostly just blobs or simple storage
class MockContentRepo extends TauriBookContentRepository {
    async initialize() {}
    async saveContent() {}
    async getContent() { return null as any; }
    async delete() {}
}

describe('Metadata and Reading Progress', () => {
    let service: LibraryService;
    let repository: InMemoryBookRepository;
    let mockBookId: string;

    beforeEach(async () => {
        repository = new InMemoryBookRepository();

        const contentRepo = new MockContentRepo();
        const documentRepo = new BrowserDocumentStorageRepository();
        const coverRepo = new BrowserCoverStorageRepository();
        const detector = new FormatDetector();
        const registry = new ImporterRegistry();

        service = new LibraryService(registry, detector, repository, contentRepo, documentRepo, coverRepo);

        const dummyBook: LibraryBook = {
            id: 'lib-1',
            bookId: 'doc-1',
            title: 'Original Title',
            sourceFormat: 'epub',
            fileReference: 'dummy.epub',
            fileSizeBytes: 100,
            dateAdded: Date.now(),
            dateLastOpened: Date.now(),
            authors: [{ id: 'a1', displayName: 'Author One' }],
            genres: []
        };
        await repository.add(dummyBook);
        mockBookId = 'lib-1';
    });

    describe('Metadata Validation and Persistence', () => {
        it('should update valid metadata', async () => {
            const updated = await service.updateBookMetadata(mockBookId, {
                title: 'New Title',
                authors: ['Author Two', 'Author Three'],
                publicationYear: 2024
            });

            expect(updated.title).toBe('New Title');
            expect(updated.publicationYear).toBe(2024);
            expect(updated.authors.length).toBe(2);
            expect(updated.authors[0].displayName).toBe('Author Two');
            expect(updated.authors[1].displayName).toBe('Author Three');
        });

        it('should reject empty titles', async () => {
            await expect(service.updateBookMetadata(mockBookId, { title: '   ' }))
                .rejects.toThrow('Title cannot be empty');
        });

        it('should reject invalid publication years', async () => {
            await expect(service.updateBookMetadata(mockBookId, { publicationYear: 999 }))
                .rejects.toThrow('Invalid publication year');
        });

        it('should unset publication year when passed null', async () => {
            await service.updateBookMetadata(mockBookId, { publicationYear: 2024 });
            const updated = await service.updateBookMetadata(mockBookId, { publicationYear: null });
            expect(updated.publicationYear).toBeNull(); // based on our SQLite implementation or memory implementation
        });
        
        it('should preserve reading progress when editing metadata', async () => {
            await service.updateReadingProgress(mockBookId, {
                bookId: 'doc-1',
                position: { type: 'fixed', bookId: 'doc-1', pageIndex: 5 },
                percentage: 50,
                lastOpenedTimestamp: Date.now()
            });

            const updated = await service.updateBookMetadata(mockBookId, { title: 'Title Change' });
            expect(updated.readingProgress?.percentage).toBe(50);
            expect(updated.readingProgress?.position.type).toBe('fixed');
        });
    });

    describe('Reading Progress Updates', () => {
        it('should persist fixed progress correctly', async () => {
            await service.updateReadingProgress(mockBookId, {
                bookId: 'doc-1',
                position: { type: 'fixed', bookId: 'doc-1', pageIndex: 10 },
                percentage: 75,
                lastOpenedTimestamp: Date.now()
            });

            const book = await repository.get(mockBookId);
            expect(book?.readingProgress?.position.type).toBe('fixed');
            if (book?.readingProgress?.position.type === 'fixed') {
                expect(book.readingProgress.position.pageIndex).toBe(10);
            }
            expect(book?.readingProgress?.percentage).toBe(75);
        });

        it('should persist reflowable progress correctly', async () => {
            await service.updateReadingProgress(mockBookId, {
                bookId: 'doc-1',
                position: { type: 'reflowable', bookId: 'doc-1', chapterId: 'ch1', blockId: 'b1' },
                percentage: 25,
                lastOpenedTimestamp: Date.now()
            });

            const book = await repository.get(mockBookId);
            expect(book?.readingProgress?.position.type).toBe('reflowable');
            if (book?.readingProgress?.position.type === 'reflowable') {
                expect(book.readingProgress.position.chapterId).toBe('ch1');
                expect(book.readingProgress.position.blockId).toBe('b1');
            }
        });
    });
});
