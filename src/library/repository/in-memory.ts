import type { BookRepository, BookContentRepository } from './index';
import type { LibraryBook, LibraryQueryOptions, Bookmark } from '../models';
import type { DocumentContent } from '../../book/models';

export class InMemoryBookRepository implements BookRepository {
    private books: Map<string, LibraryBook> = new Map();
    private bookmarks: Map<string, Bookmark> = new Map();

    public async add(book: LibraryBook): Promise<void> {
        this.books.set(book.id, { ...book });
    }

    public async get(id: string): Promise<LibraryBook | null> {
        const book = this.books.get(id);
        return book ? { ...book } : null;
    }

    public async list(options?: LibraryQueryOptions): Promise<LibraryBook[]> {
        let results = Array.from(this.books.values());

        if (options) {
            // Apply Filters
            if (options.filters) {
                const f = options.filters;
                results = results.filter(b => {
                    if (f.author && !b.authors.some(a => a.displayName.toLowerCase().includes(f.author!.toLowerCase()))) return false;
                    if (f.genre && !b.genres.some(g => g.name.toLowerCase().includes(f.genre!.toLowerCase()))) return false;
                    if (f.publicationYear && b.publicationYear !== f.publicationYear) return false;
                    if (f.format && b.sourceFormat !== f.format) return false;
                    return true;
                });
            }

            // Apply Search Query
            if (options.searchQuery) {
                const q = options.searchQuery.toLowerCase();
                results = results.filter(b => {
                    const matchTitle = b.title.toLowerCase().includes(q);
                    const matchAuthor = b.authors.some(a => a.displayName.toLowerCase().includes(q));
                    return matchTitle || matchAuthor;
                });
            }

            // Apply Sort
            if (options.sortBy) {
                const dir = options.sortDirection === 'desc' ? -1 : 1;
                
                results.sort((a, b) => {
                    let valA: any = null;
                    let valB: any = null;

                    switch (options.sortBy) {
                        case 'title':
                            valA = a.title.toLowerCase();
                            valB = b.title.toLowerCase();
                            break;
                        case 'author':
                            valA = a.authors[0]?.displayName.toLowerCase() || '';
                            valB = b.authors[0]?.displayName.toLowerCase() || '';
                            break;
                        case 'publicationYear':
                            // Handle missing publication year deterministically
                            valA = a.publicationYear ?? (dir === 1 ? Infinity : -Infinity);
                            valB = b.publicationYear ?? (dir === 1 ? Infinity : -Infinity);
                            break;
                        case 'dateAdded':
                            valA = a.dateAdded;
                            valB = b.dateAdded;
                            break;
                        case 'lastOpened':
                            valA = a.dateLastOpened ?? -1;
                            valB = b.dateLastOpened ?? -1;
                            break;
                    }

                    if (valA < valB) return -1 * dir;
                    if (valA > valB) return 1 * dir;
                    
                    // Stable sort fallback: always sort by ID if primary sort keys match
                    if (a.id < b.id) return -1;
                    if (a.id > b.id) return 1;
                    return 0;
                });
            }
        }

        return results.map(b => ({ ...b }));
    }

    public async update(id: string, updates: Partial<LibraryBook>): Promise<void> {
        const book = this.books.get(id);
        if (book) {
            this.books.set(id, { ...book, ...updates });
        }
    }

    public async delete(id: string): Promise<void> {
        this.books.delete(id);
    }

    public async exists(id: string): Promise<boolean> {
        return this.books.has(id);
    }

    public async findByFileReference(fileRef: string): Promise<LibraryBook | null> {
        for (const book of this.books.values()) {
            if (book.fileReference === fileRef) {
                return { ...book };
            }
        }
        return null;
    }

    public async addBookmark(bookmark: Bookmark): Promise<void> {
        this.bookmarks.set(bookmark.id, { ...bookmark });
    }

    public async getBookmarks(bookId: string): Promise<Bookmark[]> {
        const results: Bookmark[] = [];
        for (const bookmark of this.bookmarks.values()) {
            if (bookmark.bookId === bookId) {
                results.push({ ...bookmark });
            }
        }
        return results.sort((a, b) => b.createdAt - a.createdAt);
    }

    public async deleteBookmark(id: string): Promise<void> {
        this.bookmarks.delete(id);
    }
}

export class InMemoryBookContentRepository implements BookContentRepository {
    private contents: Map<string, DocumentContent> = new Map();

    public async store(document: DocumentContent): Promise<void> {
        this.contents.set(document.id, document);
    }

    public async get(bookId: string): Promise<DocumentContent | null> {
        return this.contents.get(bookId) || null;
    }

    public async delete(bookId: string): Promise<void> {
        this.contents.delete(bookId);
    }
}
