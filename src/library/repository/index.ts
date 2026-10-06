import type { LibraryBook, LibraryQueryOptions, Bookmark } from '../models';
import type { DocumentContent } from '../../book/models';

export interface BookRepository {
    /**
     * Adds a new book listing to the library.
     */
    add(book: LibraryBook): Promise<void>;

    /**
     * Retrieves a book listing by its library ID.
     */
    get(id: string): Promise<LibraryBook | null>;

    /**
     * Lists books based on the provided query options (search, sort, filter).
     */
    list(options?: LibraryQueryOptions): Promise<LibraryBook[]>;

    /**
     * Partially updates a book listing (e.g. updating reading progress, metadata).
     */
    update(id: string, updates: Partial<LibraryBook>): Promise<void>;

    /**
     * Deletes a book listing from the library.
     */
    delete(id: string): Promise<void>;

    /**
     * Adds a bookmark to a book.
     */
    addBookmark(bookmark: Bookmark): Promise<void>;

    /**
     * Retrieves all bookmarks for a specific book.
     */
    getBookmarks(bookId: string): Promise<Bookmark[]>;

    /**
     * Deletes a specific bookmark by its ID.
     */
    deleteBookmark(id: string): Promise<void>;

    /**
     * Checks if a book with the given library ID exists.
     */
    exists(id: string): Promise<boolean>;

    /**
     * Checks if a book exists based on specific duplicate detection criteria.
     * In Phase 9, this helps prevent re-importing the exact same file.
     */
    findByFileReference(fileRef: string): Promise<LibraryBook | null>;
}

export interface BookContentRepository {
    /**
     * Stores the complete, imported Universal Book Model or Fixed Document.
     */
    store(document: DocumentContent): Promise<void>;

    /**
     * Retrieves the complete document model by its internal bookId.
     */
    get(bookId: string): Promise<DocumentContent | null>;

    /**
     * Deletes the document content from storage.
     */
    delete(bookId: string): Promise<void>;
}

export interface DocumentSource {
    /** 
     * Opaque URL for the document.
     * Browser: blob://...
     * Tauri: bookreader://document/{id}
     */
    url: string;
}

export interface DocumentStorageRepository {
    /** Stores a raw binary document into application-managed storage */
    storeDocument(id: string, data: Uint8Array): Promise<void>;
    
    /** Returns a safe, opaque DocumentSource that the renderer can use to access the document */
    getDocumentSource(id: string): Promise<DocumentSource>;
    
    /** Deletes the binary document */
    deleteDocument(id: string): Promise<void>;
    
    /** Checks if the document exists in storage */
    hasDocument(id: string): Promise<boolean>;
}

export interface CoverArtifact {
    data: Uint8Array;
    mimeType: string; // 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface CoverSource {
    url: string;
}

export interface CoverStorageRepository {
    storeCover(bookId: string, artifact: CoverArtifact): Promise<void>;
    getCoverSource(bookId: string): Promise<CoverSource | null>;
    hasCover(bookId: string): Promise<boolean>;
    deleteCover(bookId: string): Promise<void>;
}
