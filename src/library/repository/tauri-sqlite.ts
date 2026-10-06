import Database from '@tauri-apps/plugin-sql';
import type { BookRepository } from './index';
import type { LibraryBook, LibraryQueryOptions, Bookmark } from '../models';

export class SQLiteBookRepository implements BookRepository {
    private db: Database | null = null;
    private dbName: string;

    constructor(dbName: string = 'sqlite:library.db') {
        this.dbName = dbName;
    }

    private async getDb(): Promise<Database> {
        if (!this.db) {
            this.db = await Database.load(this.dbName);
        }
        return this.db;
    }

    public async initialize(): Promise<void> {
        // Run database migrations on startup.
        // Tauri plugin-sql supports executing multiple queries.
        const db = await this.getDb();
        
        // This is a naive phase 10 migration strategy running sequentially on startup.
        // A true migration system would check a schema_versions table.
        const queries = [
            `CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                title TEXT,
                publication_year INTEGER,
                source_format TEXT,
                file_reference TEXT,
                file_size_bytes INTEGER,
                date_added INTEGER,
                date_last_opened INTEGER,
                cover_resource_id TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS authors (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS book_authors (
                book_id TEXT,
                author_id TEXT,
                PRIMARY KEY(book_id, author_id)
            )`,
            `CREATE TABLE IF NOT EXISTS genres (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS book_genres (
                book_id TEXT,
                genre_id TEXT,
                PRIMARY KEY(book_id, genre_id)
            )`,
            `CREATE TABLE IF NOT EXISTS reading_progress (
                book_id TEXT PRIMARY KEY,
                pos_type TEXT NOT NULL DEFAULT 'reflowable',
                chapter_id TEXT,
                block_id TEXT,
                inline_offset INTEGER,
                page_index INTEGER,
                pos_x REAL,
                pos_y REAL,
                percentage REAL,
                last_opened_timestamp INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY,
                book_id TEXT,
                pos_type TEXT NOT NULL DEFAULT 'reflowable',
                chapter_id TEXT,
                block_id TEXT,
                inline_offset INTEGER,
                page_index INTEGER,
                pos_x REAL,
                pos_y REAL,
                note TEXT,
                created_timestamp INTEGER
            )`
        ];

        for (const query of queries) {
            await db.execute(query);
        }

        // Migration for phase 10
        try {
            await db.execute(`ALTER TABLE books ADD COLUMN is_favorite INTEGER DEFAULT 0`);
        } catch (e) {
            // Ignore if column already exists
        }
    }

    public async list(options?: LibraryQueryOptions): Promise<LibraryBook[]> {
        const db = await this.getDb();
        
        let sql = `SELECT b.* FROM books b`;
        const conditions: string[] = [];
        const params: any[] = [];

        if (options?.searchQuery) {
            conditions.push(`(b.title LIKE $1 OR EXISTS (
                SELECT 1 FROM book_authors ba 
                JOIN authors a ON a.id = ba.author_id 
                WHERE ba.book_id = b.id AND a.display_name LIKE $1
            ))`);
            params.push(`%${options.searchQuery}%`);
        }

        if (options?.filters?.format) {
            conditions.push(`b.source_format = $${params.length + 1}`);
            params.push(options.filters.format);
        }

        if (options?.filters?.author) {
            conditions.push(`EXISTS (
                SELECT 1 FROM book_authors ba 
                WHERE ba.book_id = b.id AND ba.author_id = $${params.length + 1}
            )`);
            params.push(options.filters.author);
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }

        // Mapping options sortBy to column name
        const sortMap: Record<string, string> = {
            'title': 'b.title',
            'dateAdded': 'b.date_added',
            'lastOpened': 'b.date_last_opened',
            'author': 'b.title', // Proper author sorting in SQL requires a join, keeping it simple for phase 10
            'publicationYear': 'b.publication_year'
        };

        const orderCol = options?.sortBy ? sortMap[options.sortBy] : 'b.date_added';
        const orderDir = options?.sortDirection === 'asc' ? 'ASC' : 'DESC';
        
        sql += ` ORDER BY ${orderCol || 'b.date_added'} ${orderDir}`;

        const rows = await db.select<any[]>(sql, params);
        
        const libraryBooks: LibraryBook[] = [];
        
        for (const row of rows) {
            // Fetch nested relations
            const authors = await db.select<any[]>('SELECT a.* FROM authors a JOIN book_authors ba ON a.id = ba.author_id WHERE ba.book_id = $1', [row.id]);
            const genres = await db.select<any[]>('SELECT g.* FROM genres g JOIN book_genres bg ON g.id = bg.genre_id WHERE bg.book_id = $1', [row.id]);
            const progress = await db.select<any[]>('SELECT * FROM reading_progress WHERE book_id = $1', [row.book_id]);
            
            libraryBooks.push({
                id: row.id,
                bookId: row.book_id,
                title: row.title,
                publicationYear: row.publication_year,
                sourceFormat: row.source_format,
                fileReference: row.file_reference,
                fileSizeBytes: row.file_size_bytes,
                dateAdded: row.date_added,
                dateLastOpened: row.date_last_opened,
                coverResourceId: row.cover_resource_id,
                authors: authors.map(a => ({ id: a.id, displayName: a.display_name })),
                genres: genres.map(g => ({ id: g.id, name: g.name })),
                readingProgress: progress.length > 0 ? {
                    bookId: progress[0].book_id,
                    position: progress[0].pos_type === 'fixed' 
                        ? { type: 'fixed', bookId: progress[0].book_id, pageIndex: progress[0].page_index, x: progress[0].pos_x, y: progress[0].pos_y }
                        : { type: 'reflowable', bookId: progress[0].book_id, chapterId: progress[0].chapter_id, blockId: progress[0].block_id, inlineOffset: progress[0].inline_offset },
                    percentage: progress[0].percentage,
                    lastOpenedTimestamp: progress[0].last_opened_timestamp
                } : undefined,
                isFavorite: row.is_favorite === 1
            });
        }

        return libraryBooks;
    }

    public async exists(id: string): Promise<boolean> {
        const db = await this.getDb();
        const rows = await db.select<any[]>('SELECT 1 FROM books WHERE id = $1 LIMIT 1', [id]);
        return rows.length > 0;
    }

    public async get(id: string): Promise<LibraryBook | null> {
        const db = await this.getDb();
        const rows = await db.select<any[]>('SELECT * FROM books WHERE id = $1', [id]);
        if (rows.length === 0) return null;

        const row = rows[0];
        
        const authors = await db.select<any[]>('SELECT a.* FROM authors a JOIN book_authors ba ON a.id = ba.author_id WHERE ba.book_id = $1', [row.id]);
        const genres = await db.select<any[]>('SELECT g.* FROM genres g JOIN book_genres bg ON g.id = bg.genre_id WHERE bg.book_id = $1', [row.id]);
        const progress = await db.select<any[]>('SELECT * FROM reading_progress WHERE book_id = $1', [row.book_id]);
        
        return {
            id: row.id,
            bookId: row.book_id,
            title: row.title,
            publicationYear: row.publication_year,
            sourceFormat: row.source_format,
            fileReference: row.file_reference,
            fileSizeBytes: row.file_size_bytes,
            dateAdded: row.date_added,
            dateLastOpened: row.date_last_opened,
            coverResourceId: row.cover_resource_id,
            authors: authors.map(a => ({ id: a.id, displayName: a.display_name })),
            genres: genres.map(g => ({ id: g.id, name: g.name })),
            readingProgress: progress.length > 0 ? {
                bookId: progress[0].book_id,
                position: progress[0].pos_type === 'fixed' 
                    ? { type: 'fixed', bookId: progress[0].book_id, pageIndex: progress[0].page_index, x: progress[0].pos_x, y: progress[0].pos_y }
                    : { type: 'reflowable', bookId: progress[0].book_id, chapterId: progress[0].chapter_id, blockId: progress[0].block_id, inlineOffset: progress[0].inline_offset },
                percentage: progress[0].percentage,
                lastOpenedTimestamp: progress[0].last_opened_timestamp
            } : undefined,
            isFavorite: row.is_favorite === 1
        };
    }

    public async findByFileReference(fileRef: string): Promise<LibraryBook | null> {
        const db = await this.getDb();
        const rows = await db.select<any[]>('SELECT id FROM books WHERE file_reference = $1 LIMIT 1', [fileRef]);
        if (rows.length === 0) return null;
        return this.get(rows[0].id);
    }

    public async add(book: LibraryBook): Promise<void> {
        const db = await this.getDb();
        // Since plugin-sql does not have an explicit JS transaction block wrapper yet,
        // we'll execute BEGIN and COMMIT manually if possible, or execute queries sequentially.
        
        // Ensure no conflicting row
        await db.execute(
            `INSERT INTO books (id, book_id, title, publication_year, source_format, file_reference, file_size_bytes, date_added, date_last_opened, cover_resource_id, is_favorite)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [book.id, book.bookId, book.title, book.publicationYear, book.sourceFormat, book.fileReference, book.fileSizeBytes, book.dateAdded, book.dateLastOpened, book.coverResourceId, book.isFavorite ? 1 : 0]
        );

        for (const author of book.authors) {
            await db.execute(`INSERT OR IGNORE INTO authors (id, display_name) VALUES ($1, $2)`, [author.id, author.displayName]);
            await db.execute(`INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2)`, [book.id, author.id]);
        }

        for (const genre of book.genres) {
            await db.execute(`INSERT OR IGNORE INTO genres (id, name) VALUES ($1, $2)`, [genre.id, genre.name]);
            await db.execute(`INSERT INTO book_genres (book_id, genre_id) VALUES ($1, $2)`, [book.id, genre.id]);
        }
    }

    public async update(id: string, updates: Partial<LibraryBook>): Promise<void> {
        const db = await this.getDb();
        if (updates.dateLastOpened !== undefined) {
            await db.execute('UPDATE books SET date_last_opened = $1 WHERE id = $2', [updates.dateLastOpened, id]);
        }
        
        if (updates.title !== undefined || updates.publicationYear !== undefined) {
            const setClauses: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (updates.title !== undefined) {
                setClauses.push(`title = $${paramIndex++}`);
                params.push(updates.title);
            }
            if (updates.publicationYear !== undefined) {
                setClauses.push(`publication_year = $${paramIndex++}`);
                params.push(updates.publicationYear);
            }

            if (setClauses.length > 0) {
                params.push(id);
                await db.execute(`UPDATE books SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`, params);
            }
        }

        if (updates.isFavorite !== undefined) {
            await db.execute('UPDATE books SET is_favorite = $1 WHERE id = $2', [updates.isFavorite ? 1 : 0, id]);
        }

        if (updates.authors !== undefined) {
            // First remove existing book_authors links
            await db.execute('DELETE FROM book_authors WHERE book_id = $1', [id]);
            
            // Add new authors and links
            for (const author of updates.authors) {
                await db.execute(`INSERT OR IGNORE INTO authors (id, display_name) VALUES ($1, $2)`, [author.id, author.displayName]);
                await db.execute(`INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2)`, [id, author.id]);
            }
        }

        if (updates.genres !== undefined) {
            await db.execute('DELETE FROM book_genres WHERE book_id = $1', [id]);
            
            for (const genre of updates.genres) {
                await db.execute(`INSERT OR IGNORE INTO genres (id, name) VALUES ($1, $2)`, [genre.id, genre.name]);
                await db.execute(`INSERT INTO book_genres (book_id, genre_id) VALUES ($1, $2)`, [id, genre.id]);
            }
        }
        
        if (updates.readingProgress) {
            const p = updates.readingProgress;
            const pos = p.position;
            const isFixed = pos.type === 'fixed';
            
            await db.execute(
                `INSERT INTO reading_progress (
                    book_id, pos_type, chapter_id, block_id, inline_offset, page_index, pos_x, pos_y, percentage, last_opened_timestamp
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT(book_id) DO UPDATE SET
                 pos_type = excluded.pos_type,
                 chapter_id = excluded.chapter_id,
                 block_id = excluded.block_id,
                 inline_offset = excluded.inline_offset,
                 page_index = excluded.page_index,
                 pos_x = excluded.pos_x,
                 pos_y = excluded.pos_y,
                 percentage = excluded.percentage,
                 last_opened_timestamp = excluded.last_opened_timestamp`,
                [
                    p.bookId, 
                    pos.type, 
                    isFixed ? null : (pos as any).chapterId, 
                    isFixed ? null : (pos as any).blockId, 
                    isFixed ? null : (pos as any).inlineOffset, 
                    isFixed ? (pos as any).pageIndex : null,
                    isFixed ? (pos as any).x : null,
                    isFixed ? (pos as any).y : null,
                    p.percentage, 
                    p.lastOpenedTimestamp
                ]
            );
        }
    }

    public async delete(id: string): Promise<void> {
        const db = await this.getDb();
        
        const book = await this.get(id);
        if (!book) return;

        await db.execute('DELETE FROM book_authors WHERE book_id = $1', [id]);
        await db.execute('DELETE FROM book_genres WHERE book_id = $1', [id]);
        await db.execute('DELETE FROM reading_progress WHERE book_id = $1', [book.bookId]);
        await db.execute('DELETE FROM bookmarks WHERE book_id = $1', [book.bookId]);
        await db.execute('DELETE FROM books WHERE id = $1', [id]);
    }

    public async addBookmark(bookmark: Bookmark): Promise<void> {
        const db = await this.getDb();
        const pos = bookmark.position;
        const isFixed = pos.type === 'fixed';
        
        await db.execute(
            `INSERT INTO bookmarks (
                id, book_id, pos_type, chapter_id, block_id, inline_offset, page_index, pos_x, pos_y, note, created_timestamp
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                bookmark.id, 
                bookmark.bookId, 
                pos.type,
                isFixed ? null : (pos as any).chapterId, 
                isFixed ? null : (pos as any).blockId, 
                isFixed ? null : (pos as any).inlineOffset, 
                isFixed ? (pos as any).pageIndex : null,
                isFixed ? (pos as any).x : null,
                isFixed ? (pos as any).y : null,
                bookmark.note, 
                bookmark.createdAt
            ]
        );
    }

    public async getBookmarks(bookId: string): Promise<Bookmark[]> {
        const db = await this.getDb();
        const rows = await db.select<any[]>('SELECT * FROM bookmarks WHERE book_id = $1 ORDER BY created_timestamp DESC', [bookId]);
        
        return rows.map(row => ({
            id: row.id,
            bookId: row.book_id,
            position: row.pos_type === 'fixed'
                ? { type: 'fixed', bookId: row.book_id, pageIndex: row.page_index, x: row.pos_x, y: row.pos_y }
                : { type: 'reflowable', bookId: row.book_id, chapterId: row.chapter_id, blockId: row.block_id, inlineOffset: row.inline_offset },
            note: row.note,
            createdAt: row.created_timestamp
        }));
    }

    public async deleteBookmark(id: string): Promise<void> {
        const db = await this.getDb();
        await db.execute('DELETE FROM bookmarks WHERE id = $1', [id]);
    }
}
