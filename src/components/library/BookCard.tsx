import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryBook } from '../../library/models';
import type { BookMetadataUpdates } from '../../library/service';
import { availableSpineGenres } from './BookSpine';

import type { CoverSource } from '../../library/repository';

const DEFAULT_GENRES = ['Manga', 'Light Novel', 'Fantasy', 'Philosophy', 'Science', 'Islam', 'Fiction'];

interface Props {
    book: LibraryBook;
    onOpenBook: (bookId: string) => void;
    onRemoveBook: (bookId: string) => void;
    onUpdateBook: (bookId: string, updates: BookMetadataUpdates) => Promise<void>;
    onGetCover: (bookId: string) => Promise<CoverSource | null>;
    onUpdateCover: (bookId: string, file: File) => Promise<void>;
    hideFavoriteButton?: boolean;
}

export const BookCard: React.FC<Props> = ({ book, onOpenBook, onRemoveBook, onUpdateBook, onGetCover, onUpdateCover, hideFavoriteButton }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(book.title || '');
    const [editSeries, setEditSeries] = useState(book.seriesTitle || '');
    const [editAuthor, setEditAuthor] = useState((book.authors || []).map(a => a.displayName).join(', '));
    const [availableGenres, setAvailableGenres] = useState<string[]>(() => {
        const bookGenreNames = (book.genres || []).map(g => g.name);
        let customShelves: string[] = [];
        try {
            customShelves = JSON.parse(localStorage.getItem('custom_genre_shelves') || '[]');
        } catch {
            // ignore
        }
        return Array.from(new Set([...DEFAULT_GENRES, ...availableSpineGenres, ...customShelves, ...bookGenreNames]));
    });
    const [selectedGenres, setSelectedGenres] = useState<Set<string>>(() => {
        return new Set((book.genres || []).map(g => g.name));
    });
    const [newGenreName, setNewGenreName] = useState('');
    const [editYear, setEditYear] = useState(book.publicationYear?.toString() || '');
    const [error, setError] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [coverLoading, setCoverLoading] = useState(true);
    const [isUploadingCover, setIsUploadingCover] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        let isMounted = true;
        setCoverLoading(true);
        onGetCover(book.id).then(source => {
            if (isMounted) {
                setCoverUrl(source?.url || null);
                setCoverLoading(false);
            }
        }).catch(() => {
            if (isMounted) setCoverLoading(false);
        });
        return () => { isMounted = false; };
    }, [book.id, book.coverResourceId, onGetCover]);

    const progressPct = book.readingProgress?.percentage 
        ? Math.round(book.readingProgress.percentage) 
        : 0;

    const toggleGenre = (genre: string) => {
        setSelectedGenres(new Set([genre]));
    };

    const handleAddGenre = () => {
        const trimmed = newGenreName.trim();
        if (trimmed && !availableGenres.includes(trimmed)) {
            setAvailableGenres([...availableGenres, trimmed]);
            setSelectedGenres(new Set([trimmed]));
            setNewGenreName('');
        }
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setError(null);
        
        try {
            const updates: BookMetadataUpdates = {
                title: editTitle,
                seriesTitle: editSeries.trim() === '' ? undefined : editSeries.trim(), // Empty string is basically no series, wait updates is only for changing? 
                // wait, if we want to REMOVE a series, we need to pass empty string or null?
                // The updates interface says `seriesTitle?: string`. If it's undefined, it's not updated.
                // We should pass editSeries.trim().
                authors: editAuthor.split(',').map(a => a.trim()).filter(a => a.length > 0),
                genres: Array.from(selectedGenres),
                publicationYear: editYear.trim() === '' ? null : parseInt(editYear, 10)
            };
            updates.seriesTitle = editSeries.trim(); // Will set it to empty string if removed, service should handle it
            await onUpdateBook(book.id, updates);
            setIsEditing(false);
        } catch (err: any) {
            setError(err.message || 'Failed to update book');
        }
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(false);
        setEditTitle(book.title || '');
        setEditSeries(book.seriesTitle || '');
        setEditAuthor((book.authors || []).map(a => a.displayName).join(', '));
        setEditYear(book.publicationYear?.toString() || '');
        setError(null);
    };

    const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setError(null);
        setIsUploadingCover(true);
        
        try {
            await onUpdateCover(book.id, files[0]);
            // The cover update will change book.coverResourceId, which will trigger the useEffect to reload the cover
        } catch (err: any) {
            setError(err.message || 'Failed to update cover image');
        } finally {
            setIsUploadingCover(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <>
            {isEditing && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    zIndex: 9999,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={handleCancel}>
                    <div 
                        className="library-edit-form" 
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            top: 'auto', left: 'auto',
                            width: '400px', maxWidth: '90vw',
                            margin: 0,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}
                    >
                        <div className="library-edit-title">Edit Book Metadata</div>
                        
                        {error && <div style={{ color: 'red', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{error}</div>}
                        
                        <label className="library-edit-label">Title</label>
                        <input 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            className="library-input library-edit-input"
                        />

                        <label className="library-edit-label">Series</label>
                        <input 
                            value={editSeries} 
                            onChange={e => setEditSeries(e.target.value)} 
                            className="library-input library-edit-input"
                            placeholder="e.g. One Piece"
                        />

                        <label className="library-edit-label">Author(s) (comma separated)</label>
                        <input 
                            value={editAuthor} 
                            onChange={e => setEditAuthor(e.target.value)} 
                            className="library-input library-edit-input"
                        />

                        <label className="library-edit-label">Category/Genre</label>
                        <div className="import-genre-grid">
                            {availableGenres.map(genre => (
                                <label key={genre} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                    <input 
                                        type="radio" 
                                        name={`genre-selection-${book.id}`}
                                        checked={selectedGenres.has(genre)}
                                        onChange={() => toggleGenre(genre)}
                                    />
                                    {genre}
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <input 
                                value={newGenreName}
                                onChange={e => setNewGenreName(e.target.value)}
                                placeholder="New category..."
                                className="library-input library-edit-input"
                                style={{ marginBottom: 0, flex: 1 }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAddGenre();
                                    }
                                }}
                            />
                            <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddGenre(); }} 
                                className="library-btn library-btn-ghost"
                            >
                                Add
                            </button>
                        </div>

                        <label className="library-edit-label">Publication Year</label>
                        <input 
                            value={editYear} 
                            onChange={e => setEditYear(e.target.value)} 
                            type="number"
                            className="library-input library-edit-input"
                        />

                        <div className="library-edit-actions">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleCoverChange}
                            />
                            <button 
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} 
                                className="library-btn library-btn-ghost"
                                style={{ marginRight: 'auto' }}
                                disabled={isUploadingCover}
                            >
                                {isUploadingCover ? 'Uploading...' : 'Change cover'}
                            </button>
                            <button onClick={handleCancel} className="library-btn library-btn-ghost" disabled={isUploadingCover}>Cancel</button>
                            <button onClick={handleSave} className="library-btn library-btn-primary" disabled={isUploadingCover}>Save</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            
            <div className={`library-book-card ${book.sourceFormat === 'series' ? 'series-card' : ''}`}>
            <div 
                className="library-book-cover-container"
                title={book.sourceFormat === 'series' ? "Open Series" : "Click to open"}
                style={{ position: 'relative' }}
            >
                {/* 1. Cover Image (No Click) */}
                {coverLoading ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>Loading...</span>
                    </div>
                ) : coverUrl ? (
                    <img 
                        src={coverUrl} 
                        alt={`Cover of ${book.title}`} 
                        className="library-book-cover"
                        onError={() => setCoverUrl(null)} 
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ opacity: 0.5, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No Cover</span>
                    </div>
                )}
                
                {/* 2. Explicit Click Layer (z-index: 5) */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenBook(book.id);
                    }}
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 5,
                        cursor: 'pointer'
                    }}
                    title="Click to open"
                />

                {!hideFavoriteButton && (
                    <button 
                        className={`library-favorite-btn ${book.isFavorite ? 'is-favorite' : ''}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onUpdateBook(book.id, { isFavorite: !book.isFavorite });
                        }}
                        style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, pointerEvents: 'auto' }}
                        title={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                        <svg viewBox="0 0 24 24" fill={book.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                )}
            </div>

            <div className="library-book-footer">
                <span className={progressPct > 0 ? "library-progress-subtle" : "library-progress-none"}>
                    {progressPct > 0 ? `${progressPct}% read` : 'Not started'}
                </span>
                <div className="library-card-actions">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                        className="library-btn library-btn-ghost"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.85rem', pointerEvents: 'auto' }}
                    >
                        Edit
                    </button>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemoveBook(book.id);
                        }}
                        className="library-btn library-btn-danger"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.85rem', pointerEvents: 'auto' }}
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
        </>
    );
};
