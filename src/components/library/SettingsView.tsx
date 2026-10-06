import React, { useState } from 'react';
import './SettingsView.css';

interface Props {
    customGenres: string[];
    onAddGenre: (genre: string) => void;
    onEditGenre: (oldGenre: string, newGenre: string) => void;
    onDeleteGenre: (genre: string) => void;
    onClose: () => void;
}

// Lucide icons (SVG)
const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const PlusIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const EditIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
);

const TrashIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
);

const CheckIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const XIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

export const SettingsView: React.FC<Props> = ({
    customGenres,
    onAddGenre,
    onEditGenre,
    onDeleteGenre,
    onClose
}) => {
    const [newGenre, setNewGenre] = useState('');
    const [editingGenre, setEditingGenre] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [genreToDelete, setGenreToDelete] = useState<string | null>(null);

    const handleAdd = () => {
        const trimmed = newGenre.trim();
        if (trimmed && !customGenres.includes(trimmed)) {
            onAddGenre(trimmed);
            setNewGenre('');
        }
    };

    const handleSaveEdit = () => {
        const trimmed = editValue.trim();
        if (trimmed && editingGenre && trimmed !== editingGenre && !customGenres.includes(trimmed)) {
            onEditGenre(editingGenre, trimmed);
        }
        setEditingGenre(null);
        setEditValue('');
    };

    return (
        <div className="settings-container">
            <header className="settings-header">
                <h1 className="settings-title">Preferences</h1>
                <button 
                    className="settings-close-btn" 
                    onClick={onClose}
                    aria-label="Close Settings"
                >
                    <CloseIcon />
                </button>
            </header>

            <main className="settings-panel">
                <h2 className="settings-section-title">Manage Custom Genres</h2>
                
                <div className="settings-input-group">
                    <input 
                        type="text" 
                        className="settings-input"
                        placeholder="Create a new shelf..."
                        value={newGenre}
                        onChange={e => setNewGenre(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleAdd();
                        }}
                    />
                    <button className="settings-btn settings-btn-primary" onClick={handleAdd}>
                        <PlusIcon /> Add Shelf
                    </button>
                </div>

                {customGenres.length === 0 ? (
                    <div className="settings-empty">
                        <p>No custom genres have been created yet. Add one above to start organizing.</p>
                    </div>
                ) : (
                    <ul className="settings-list">
                        {customGenres.map((genre, index) => (
                            <li 
                                key={genre} 
                                className="settings-list-item"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                {editingGenre === genre ? (
                                    <div className="settings-edit-group">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveEdit();
                                                if (e.key === 'Escape') setEditingGenre(null);
                                            }}
                                            className="settings-input settings-edit-input"
                                        />
                                        <div className="settings-edit-actions">
                                            <button className="settings-icon-btn" style={{ color: 'var(--accent)' }} onClick={handleSaveEdit} title="Save">
                                                <CheckIcon />
                                            </button>
                                            <button className="settings-icon-btn" onClick={() => setEditingGenre(null)} title="Cancel">
                                                <XIcon />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <span className="settings-genre-name">{genre}</span>
                                        <div className="settings-actions">
                                            <button 
                                                className="settings-icon-btn" 
                                                onClick={() => {
                                                    setEditingGenre(genre);
                                                    setEditValue(genre);
                                                }}
                                                title="Edit"
                                            >
                                                <EditIcon />
                                            </button>
                                            <button 
                                                className="settings-icon-btn danger" 
                                                onClick={() => setGenreToDelete(genre)}
                                                title="Delete"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </main>

            {/* Premium Delete Confirmation Modal */}
            {genreToDelete && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal danger">
                        <h3 className="settings-modal-title">Delete Shelf</h3>
                        
                        <p className="settings-modal-text">
                            Are you sure you want to delete the <strong>"{genreToDelete}"</strong> shelf?
                        </p>
                        
                        <div className="settings-warning-box">
                            <strong>Danger:</strong> This will permanently delete all books categorized under this shelf from your library. This action cannot be undone.
                        </div>
                        
                        <div className="settings-modal-actions">
                            <button 
                                className="settings-btn settings-btn-ghost" 
                                onClick={() => setGenreToDelete(null)}
                            >
                                Cancel
                            </button>
                            <button 
                                className="settings-modal-btn-danger" 
                                onClick={() => {
                                    onDeleteGenre(genreToDelete);
                                    setGenreToDelete(null);
                                }}
                            >
                                I understand, delete everything
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
