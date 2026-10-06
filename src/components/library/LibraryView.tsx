import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { LibraryBook } from '../../library/models';
import type { BookMetadataUpdates } from '../../library/service';
import { BookCard } from './BookCard';
import type { CoverSource } from '../../library/repository';
import gsap from 'gsap';
import { BookSpine, getSpineWidth } from './BookSpine';

interface Props {
    books: LibraryBook[];
    onOpenBook: (bookId: string) => void;
    onRemoveBook: (bookId: string) => void;
    onUpdateBook: (bookId: string, updates: BookMetadataUpdates) => Promise<void>;
    onGetCover: (bookId: string) => Promise<CoverSource | null>;
    onUpdateCover: (bookId: string, file: File) => Promise<void>;
    onOpenSeries?: (seriesTitle: string) => void;
}

interface Rack {
    genre: string;
    isFirstOfGenre: boolean;
    books: LibraryBook[];
}



const Shelf: React.FC<{
    leftRack: Rack;
    rightRack: Rack | null;
    activeBookId: string | null;
    onToggleBook: (id: string | null) => void;
    onOpenBook: (bookId: string) => void;
    onRemoveBook: (bookId: string) => void;
    onUpdateBook: (bookId: string, updates: BookMetadataUpdates) => Promise<void>;
    onGetCover: (bookId: string) => Promise<CoverSource | null>;
    onUpdateCover: (bookId: string, file: File) => Promise<void>;
    onOpenSeries?: (seriesTitle: string) => void;
}> = ({ leftRack, rightRack, activeBookId, onToggleBook, onOpenBook, onRemoveBook, onUpdateBook, onGetCover, onUpdateCover, onOpenSeries }) => {
    const shelfRef = useRef<HTMLDivElement>(null);
    const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const wrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
    
    const books = useMemo(() => rightRack ? [...leftRack.books, ...rightRack.books] : leftRack.books, [leftRack, rightRack]);
    const bookWidths = useMemo(() => books.map(b => getSpineWidth(b.id || b.title || 'unknown')), [books]);

    useEffect(() => {
        const ctx = gsap.context(() => {
            books.forEach((book, i) => {
                const container = containerRefs.current[book.id];
                const wrapper = wrapperRefs.current[book.id];
                if (!container || !wrapper) return;

                const isExpanded = activeBookId === book.id;
                
                if (isExpanded) {
                    // Derive dynamic width based on the actual height to preserve aspect ratio
                    const currentHeight = container.getBoundingClientRect().height;
                    const targetExpandedWidth = currentHeight * (220 / 390); // Use the original desktop aspect ratio

                    gsap.set(container, { zIndex: 50 });
                    gsap.to(container, {
                        width: targetExpandedWidth,
                        duration: 0.5,
                        ease: "power3.inOut"
                    });
                    gsap.to(wrapper, {
                        rotateY: 0,
                        z: 30,
                        duration: 0.5,
                        ease: "power3.inOut"
                    });
                } else {
                    gsap.set(container, { zIndex: 1 });
                    gsap.to(container, {
                        width: bookWidths[i],
                        duration: 0.4,
                        ease: "power2.inOut"
                    });
                    gsap.to(wrapper, {
                        rotateY: 90,
                        z: 0,
                        duration: 0.4,
                        ease: "power2.inOut"
                    });
                }
            });
        }, shelfRef);
        return () => ctx.revert();
    }, [activeBookId, books, bookWidths]);

    const renderBook = (book: LibraryBook) => {
        return (
            <div 
                key={book.id} 
                className="book-container"
                ref={el => { if (el) containerRefs.current[book.id] = el; }}
                onClick={(e) => {
                    if (activeBookId !== book.id) {
                        e.stopPropagation();
                        onToggleBook(book.id);
                    } else {
                        e.stopPropagation();
                    }
                }}
            >
                <div className="book-3d-wrapper" ref={el => { if (el) wrapperRefs.current[book.id] = el; }}>
                    <div className="book-cover-face">
                        <BookCard 
                            book={book} 
                            onOpenBook={book.sourceFormat === 'series' && onOpenSeries ? () => onOpenSeries(book.seriesTitle!) : onOpenBook} 
                            onRemoveBook={onRemoveBook} 
                            onUpdateBook={onUpdateBook} 
                            onGetCover={onGetCover}
                            onUpdateCover={onUpdateCover}
                        />
                    </div>
                    <BookSpine book={book} isActive={activeBookId === book.id} />
                </div>
            </div>
        );
    };

    return (
        <div className="shelf-row" ref={shelfRef}>
            <div className="shelf-books" onClick={() => onToggleBook(null)}>
                <div className="shelf-rack">
                    {leftRack.books.map((book) => renderBook(book))}
                </div>
                
                {rightRack && (
                    <div className="shelf-divider" style={{ 
                        width: '8px', 
                        height: '100%', 
                        background: 'linear-gradient(90deg, #3a2218, #2a1208, #3a2218)', 
                        margin: '0 1rem', 
                        boxShadow: 'inset 2px 0 4px rgba(0,0,0,0.5), -1px 0 2px rgba(0,0,0,0.3), 1px 0 2px rgba(0,0,0,0.3)',
                        borderLeft: '1px solid #1a0802',
                        borderRight: '1px solid #1a0802',
                        borderRadius: '2px'
                    }} />
                )}
                
                {rightRack && (
                    <div className="shelf-rack">
                        {rightRack.books.map((book) => renderBook(book))}
                    </div>
                )}
            </div>
            <div className="shelf-board" />
            <div className="shelf-shadow" />
        </div>
    );
};

export const LibraryView: React.FC<Props> = (props) => {
    const { books } = props;
    const [activeBookId, setActiveBookId] = useState<string | null>(null);
    const [booksPerShelf, setBooksPerShelf] = useState(6);

    useEffect(() => {
        const updateLayout = () => {
            const width = window.innerWidth;
            if (width < 640) setBooksPerShelf(4);
            else if (width < 1024) setBooksPerShelf(8);
            else setBooksPerShelf(14);
        };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);



    const groupedBooks = useMemo(() => {
        const groups: Record<string, LibraryBook[]> = Object.create(null);
        
        // First pass: extract distinct books vs series groups
        const seriesMap: Record<string, LibraryBook[]> = Object.create(null);
        const individualBooks: LibraryBook[] = [];

        books.forEach(book => {
            if (book.seriesTitle && props.onOpenSeries) {
                if (!seriesMap[book.seriesTitle]) seriesMap[book.seriesTitle] = [];
                seriesMap[book.seriesTitle].push(book);
            } else {
                individualBooks.push(book);
            }
        });

        // Convert series groups into mock LibraryBooks
        const displayBooks: LibraryBook[] = [...individualBooks];
        for (const [title, seriesBooks] of Object.entries(seriesMap)) {
            displayBooks.push({
                id: seriesBooks[0].id,
                bookId: seriesBooks[0].bookId,
                title: title,
                authors: seriesBooks[0]?.authors || [],
                genres: seriesBooks[0]?.genres || [],
                sourceFormat: 'series',
                fileReference: 'series',
                fileSizeBytes: seriesBooks.length, // use fileSizeBytes to store volume count for UI hack
                dateAdded: seriesBooks[0]?.dateAdded || Date.now(),
                seriesTitle: title,
                coverResourceId: seriesBooks[0]?.coverResourceId // Use first volume's cover
            });
        }

        displayBooks.forEach(book => {
            const genre = book.genres && book.genres.length > 0 ? book.genres[0].name : 'Uncategorized';
            if (!groups[genre]) groups[genre] = [];
            groups[genre].push(book);
        });

        // Initialize auto-detected spine genres (only if we want them to have shelves even if empty)
        // Wait, the user specifically requested that shelves ONLY appear if they have books.
        // So we should NOT explicitly initialize any empty arrays here!

        // Sort books by author within each genre
        Object.keys(groups).forEach(genre => {
            groups[genre].sort((a, b) => {
                const authorA = a.authors?.[0]?.displayName || 'Unknown';
                const authorB = b.authors?.[0]?.displayName || 'Unknown';
                return authorA.localeCompare(authorB);
            });
        });

        return groups;
    }, [books, props.onOpenSeries]);

    const shelfRows = useMemo(() => {
        // Sort genres alphabetically, but put 'Uncategorized' at the end
        const sortedGenres = Object.keys(groupedBooks).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
        });
        
        const allRacks: Rack[] = [];
        
        sortedGenres.forEach(genre => {
            const genreBooks = groupedBooks[genre];
            const isMobile = window.innerWidth < 640;
            const booksPerRack = isMobile ? booksPerShelf : Math.max(1, Math.floor(booksPerShelf / 2));
            for (let i = 0; i < genreBooks.length; i += booksPerRack) {
                allRacks.push({
                    genre,
                    isFirstOfGenre: i === 0,
                    books: genreBooks.slice(i, i + booksPerRack)
                });
            }
        });
        
        const shelfRows: { left: Rack, right: Rack | null }[] = [];
        const isMobile = window.innerWidth < 640;
        
        for (let i = 0; i < allRacks.length; i += (isMobile ? 1 : 2)) {
            shelfRows.push({
                left: allRacks[i],
                right: isMobile ? null : (allRacks[i+1] || null)
            });
        }
        
        return shelfRows;
    }, [groupedBooks, booksPerShelf]);


    return (
        <div style={{ paddingBottom: '4rem' }}>
            {books.length === 0 ? (
                <div className="library-empty-state" style={{ marginTop: '2rem' }}>
                    <div className="library-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                        </svg>
                    </div>
                    <h2>Your library is waiting.</h2>
                    <p>Import your first book to begin building your personal collection.</p>
                </div>
            ) : (
                shelfRows.map((row, idx) => (
                    <div key={`shelf-row-wrapper-${idx}`} style={{ marginBottom: '1rem' }}>
                    <div className="shelf-row-wrapper">
                        <div style={{ flex: 1, position: 'relative' }}>
                            {row.left.isFirstOfGenre && (
                                <h2 className="shelf-genre-title" style={{ padding: 0, marginBottom: '0.5rem', marginTop: 0 }}>{row.left.genre}</h2>
                            )}
                            {!row.left.isFirstOfGenre && <div style={{ height: '2rem', marginBottom: '0.5rem' }} />}
                        </div>
                        {row.right && <div style={{ width: '8px', margin: '0 1rem' }} />}
                        {row.right && (
                            <div style={{ flex: 1, position: 'relative' }}>
                                {row.right.isFirstOfGenre && (
                                    <h2 className="shelf-genre-title" style={{ padding: 0, marginBottom: '0.5rem', marginTop: 0 }}>{row.right.genre}</h2>
                                )}
                                {!row.right.isFirstOfGenre && <div style={{ height: '2rem', marginBottom: '0.5rem' }} />}
                            </div>
                        )}
                    </div>
                    <Shelf 
                        leftRack={row.left}
                        rightRack={row.right}
                        activeBookId={activeBookId}
                        onToggleBook={setActiveBookId}
                        onOpenBook={props.onOpenBook}
                        onRemoveBook={props.onRemoveBook}
                        onUpdateBook={props.onUpdateBook}
                        onGetCover={props.onGetCover}
                        onUpdateCover={props.onUpdateCover}
                        onOpenSeries={props.onOpenSeries}
                    />
                </div>
            )))}
        </div>
    );
};
