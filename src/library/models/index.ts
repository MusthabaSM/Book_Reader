import type { Author, Genre } from '../../book/models';
import type { ReadingPosition } from '../../pagination/page-model';

export type FileReference = string; // Opaque reference for the underlying storage layer

export interface ReadingProgress {
    bookId: string;
    position: ReadingPosition;
    
    // Cached/derived values for library UI convenience
    percentage?: number; // 0-100
    currentSpreadIndex?: number; // Non-canonical, changes on layout config changes
    lastOpenedTimestamp?: number;
}

export interface Bookmark {
    id: string;
    bookId: string;
    position: ReadingPosition;
    createdAt: number;
    note?: string;
}

export interface LibraryBook {
    id: string; // Unique application-level library ID
    bookId: string; // Internal book ID (from parsing)
    title: string;
    authors: Author[];
    genres: Genre[];
    publicationYear?: number;
    sourceFormat: string;
    fileReference: FileReference; // Opaque reference to original file
    fileSizeBytes: number;
    
    coverResourceId?: string; // Resource ID referencing the cover inside the Book Content
    
    dateAdded: number; // Timestamp
    dateLastOpened?: number; // Timestamp
    readingProgress?: ReadingProgress;
    isFavorite?: boolean;
    seriesTitle?: string;
}

export type SortField = 'title' | 'author' | 'publicationYear' | 'dateAdded' | 'lastOpened';
export type SortDirection = 'asc' | 'desc';

export interface LibraryFilter {
    author?: string;
    genre?: string;
    publicationYear?: number;
    format?: string;
}

export interface LibraryQueryOptions {
    searchQuery?: string; // Case-insensitive matching across multiple fields (e.g., title, author)
    filters?: LibraryFilter;
    sortBy?: SortField;
    sortDirection?: SortDirection;
}
