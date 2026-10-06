import React from 'react';
import type { LibraryBook } from '../../library/models';
import type { CoverSource } from '../../library/repository';
import type { BookMetadataUpdates } from '../../library/service';
import { BookCard } from './BookCard';

interface Props {
    books: LibraryBook[];
    onOpenBook: (bookId: string) => void;
    onRemoveBook: (bookId: string) => void;
    onUpdateBook: (bookId: string, updates: BookMetadataUpdates) => Promise<void>;
    onGetCover: (bookId: string) => Promise<CoverSource | null>;
    onUpdateCover: (bookId: string, file: File) => Promise<void>;
    onOpenSeries?: (seriesTitle: string) => void;
}

export const HomeView: React.FC<Props> = (props) => {
    const { books } = props;

    if (books.length === 0) {
        return (
            <div className="library-empty-state">
                <div className="library-empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                    </svg>
                </div>
                <h2>Your library is waiting.</h2>
                <p>Import your first book to begin building your personal collection.</p>
            </div>
        );
    }

    const displayBooks: LibraryBook[] = [];
    const seriesMap: Record<string, LibraryBook[]> = Object.create(null);

    books.forEach(book => {
        if (book.seriesTitle && props.onOpenSeries) {
            if (!seriesMap[book.seriesTitle]) seriesMap[book.seriesTitle] = [];
            seriesMap[book.seriesTitle].push(book);
        } else {
            displayBooks.push(book);
        }
    });

    for (const [title, seriesBooks] of Object.entries(seriesMap)) {
        displayBooks.push({
            id: seriesBooks[0].id,
            bookId: seriesBooks[0].bookId,
            title: title,
            authors: seriesBooks[0]?.authors || [],
            genres: seriesBooks[0]?.genres || [],
            sourceFormat: 'series',
            fileReference: 'series',
            fileSizeBytes: seriesBooks.length,
            dateAdded: seriesBooks[0]?.dateAdded || Date.now(),
            seriesTitle: title,
            coverResourceId: seriesBooks[0]?.coverResourceId
        });
    }

    // Sort to keep series and books ordered by title
    displayBooks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return (
        <div className="library-grid">
            {displayBooks.map(book => (
                <BookCard 
                    key={book.id}
                    book={book} 
                    onOpenBook={book.sourceFormat === 'series' && props.onOpenSeries ? () => props.onOpenSeries!(book.seriesTitle!) : props.onOpenBook} 
                    onRemoveBook={props.onRemoveBook} 
                    onUpdateBook={props.onUpdateBook} 
                    onGetCover={props.onGetCover}
                    onUpdateCover={props.onUpdateCover}
                    hideFavoriteButton={true}
                />
            ))}
        </div>
    );
};
