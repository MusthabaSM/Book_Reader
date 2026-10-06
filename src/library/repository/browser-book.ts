import type { BookRepository } from './index';
import type { LibraryBook, LibraryQueryOptions, Bookmark } from '../models';
import { get, set, del, keys } from 'idb-keyval';

export class BrowserBookRepository implements BookRepository {
    async add(book: LibraryBook): Promise<void> {
        await set(`book_${book.id}`, book);
    }

    async get(id: string): Promise<LibraryBook | null> {
        const book = await get(`book_${id}`);
        return book || null;
    }

    async list(options?: LibraryQueryOptions): Promise<LibraryBook[]> {
        const allKeys = await keys();
        const bookKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('book_'));
        const books: LibraryBook[] = [];
        
        for (const key of bookKeys) {
            const book = await get(key as string);
            if (book) books.push(book);
        }

        let filtered = books;
        if (options?.filters?.format) {
            filtered = filtered.filter(b => b.sourceFormat === options.filters?.format);
        }
        if (options?.searchQuery) {
            const q = options.searchQuery.toLowerCase();
            filtered = filtered.filter(b => 
                b.title.toLowerCase().includes(q) || 
                b.authors.some(a => a.name.toLowerCase().includes(q))
            );
        }

        const direction = options?.sortDirection === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            if (options?.sortBy === 'title') return a.title.localeCompare(b.title) * direction;
            return ((a.dateAdded || 0) - (b.dateAdded || 0)) * direction;
        });

        return filtered;
    }

    async update(id: string, updates: Partial<LibraryBook>): Promise<void> {
        const book = await this.get(id);
        if (book) {
            Object.assign(book, updates);
            await set(`book_${id}`, book);
        }
    }

    async delete(id: string): Promise<void> {
        await del(`book_${id}`);
    }

    async addBookmark(bookmark: Bookmark): Promise<void> {
        await set(`bookmark_${bookmark.id}`, bookmark);
    }

    async getBookmarks(bookId: string): Promise<Bookmark[]> {
        const allKeys = await keys();
        const bookmarkKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('bookmark_'));
        const bookmarks: Bookmark[] = [];
        
        for (const key of bookmarkKeys) {
            const bm = await get(key as string);
            if (bm && bm.bookId === bookId) bookmarks.push(bm);
        }
        return bookmarks;
    }

    async deleteBookmark(id: string): Promise<void> {
        await del(`bookmark_${id}`);
    }

    async exists(id: string): Promise<boolean> {
        const book = await this.get(id);
        return !!book;
    }

    async findByFileReference(fileRef: string): Promise<LibraryBook | null> {
        const books = await this.list();
        return books.find(b => b.fileReference === fileRef) || null;
    }
}
