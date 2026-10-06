import type { BookRepository } from '../library/repository';
import type { LibraryBook, LibraryQueryOptions, Bookmark } from '../library/models';
import type { SyncEngine } from './engine';

export class SyncWrappedBookRepository implements BookRepository {
    private inner: BookRepository;
    private syncEngine: SyncEngine;

    constructor(inner: BookRepository, syncEngine: SyncEngine) {
        this.inner = inner;
        this.syncEngine = syncEngine;
    }

    public async add(book: LibraryBook): Promise<void> {
        await this.inner.add(book);
        this.syncEngine.enqueueBookUpsert(book);
    }

    public async get(id: string): Promise<LibraryBook | null> {
        return this.inner.get(id);
    }

    public async list(options?: LibraryQueryOptions): Promise<LibraryBook[]> {
        return this.inner.list(options);
    }

    public async update(id: string, updates: Partial<LibraryBook>): Promise<void> {
        await this.inner.update(id, updates);
        const updatedBook = await this.inner.get(id);
        if (updatedBook) {
            this.syncEngine.enqueueBookUpsert(updatedBook);
        }
    }

    public async delete(id: string): Promise<void> {
        await this.inner.delete(id);
        this.syncEngine.enqueueBookDelete(id);
    }

    public async addBookmark(bookmark: Bookmark): Promise<void> {
        return this.inner.addBookmark(bookmark);
        // Note: Bookmarks could also be synced if added to schema later
    }

    public async getBookmarks(bookId: string): Promise<Bookmark[]> {
        return this.inner.getBookmarks(bookId);
    }

    public async deleteBookmark(id: string): Promise<void> {
        return this.inner.deleteBookmark(id);
    }

    public async exists(id: string): Promise<boolean> {
        return this.inner.exists(id);
    }

    public async findByFileReference(fileRef: string): Promise<LibraryBook | null> {
        return this.inner.findByFileReference(fileRef);
    }
}
