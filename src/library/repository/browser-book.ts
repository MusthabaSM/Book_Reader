import type { BookRepository } from './index';
import type { LibraryBook as Book } from '../models';
import { get, set, del, keys } from 'idb-keyval';

export class BrowserBookRepository implements BookRepository {
    async initialize(): Promise<void> {}

    async createBook(book: Book): Promise<void> {
        await set(`book_${book.id}`, book);
    }

    async updateBook(book: Book): Promise<void> {
        await set(`book_${book.id}`, book);
    }

    async deleteBook(id: string): Promise<void> {
        await del(`book_${id}`);
    }

    async getBook(id: string): Promise<Book | null> {
        const book = await get(`book_${id}`);
        return book || null;
    }

    async listBooks(query?: { shelfId?: string; searchQuery?: string; format?: string; sortBy?: 'dateAdded' | 'title' | 'author' | 'lastRead'; sortDirection?: 'asc' | 'desc' }): Promise<Book[]> {
        const allKeys = await keys();
        const bookKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('book_'));
        const books: Book[] = [];
        
        for (const key of bookKeys) {
            const book = await get(key as string);
            if (book) books.push(book);
        }

        let filtered = books;
        if (query?.shelfId) {
            filtered = filtered.filter(b => b.shelfId === query.shelfId);
        }
        if (query?.format) {
            filtered = filtered.filter(b => b.format === query.format);
        }
        if (query?.searchQuery) {
            const q = query.searchQuery.toLowerCase();
            filtered = filtered.filter(b => 
                b.title.toLowerCase().includes(q) || 
                (b.author && b.author.toLowerCase().includes(q))
            );
        }

        const direction = query?.sortDirection === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            if (query?.sortBy === 'title') return a.title.localeCompare(b.title) * direction;
            if (query?.sortBy === 'author') return (a.author || '').localeCompare(b.author || '') * direction;
            return ((a.dateAdded || 0) - (b.dateAdded || 0)) * direction;
        });

        return filtered;
    }
}
