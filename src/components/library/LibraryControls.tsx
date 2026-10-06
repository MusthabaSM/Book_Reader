import React, { useState } from 'react';
import type { LibraryQueryOptions, SortField, SortDirection } from '../../library/models';
import { runTauriPersistenceTest } from '../../library/__tests__/tauri-persistence';

interface Props {
    currentQuery: LibraryQueryOptions;
    onQueryChange: (query: LibraryQueryOptions) => void;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const LibraryControls: React.FC<Props> = ({ currentQuery, onQueryChange }) => {
    const [search, setSearch] = useState(currentQuery.searchQuery || '');
    const [sortField, setSortField] = useState<SortField>(currentQuery.sortBy || 'dateAdded');
    const [sortDir, setSortDir] = useState<SortDirection>(currentQuery.sortDirection || 'desc');
    const [isTesting, setIsTesting] = useState(false);
    
    // Very basic filter states for Phase 9 demo
    const [formatFilter, setFormatFilter] = useState(currentQuery.filters?.format || '');

    const applySearch = () => {
        onQueryChange({
            ...currentQuery,
            searchQuery: search || undefined
        });
    };

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const field = e.target.value as SortField;
        setSortField(field);
        onQueryChange({ ...currentQuery, sortBy: field, sortDirection: sortDir });
    };

    const handleDirChange = () => {
        const newDir = sortDir === 'asc' ? 'desc' : 'asc';
        setSortDir(newDir);
        onQueryChange({ ...currentQuery, sortBy: sortField, sortDirection: newDir });
    };

    const handleFormatFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const fmt = e.target.value;
        setFormatFilter(fmt);
        onQueryChange({
            ...currentQuery,
            filters: {
                ...currentQuery.filters,
                format: fmt || undefined
            }
        });
    };

    const handleRunTests = async () => {
        setIsTesting(true);
        try {
            await runTauriPersistenceTest();
            alert('Tests passed! Check console for details.');
        } catch (e: any) {
            alert('Tests failed: ' + e.message);
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="library-controls">
            {isTauri && (
                <button 
                    onClick={handleRunTests} 
                    disabled={isTesting}
                    className="library-btn library-btn-secondary">
                    {isTesting ? 'Running E2E...' : 'Run Tauri E2E Test'}
                </button>
            )}

            <div className="library-controls-group">
                <input 
                    type="text" 
                    placeholder="Search titles, authors..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applySearch()}
                    className="library-input search-input"
                />
                <button onClick={applySearch} className="library-btn library-btn-secondary">Search</button>
            </div>

            <div className="library-controls-group">
                <label>Sort:</label>
                <select value={sortField} onChange={handleSortChange} className="library-select">
                    <option value="dateAdded">Date Added</option>
                    <option value="lastOpened">Last Opened</option>
                    <option value="title">Title</option>
                    <option value="author">Author</option>
                    <option value="publicationYear">Publication Year</option>
                </select>
                <button onClick={handleDirChange} className="library-btn library-btn-secondary" style={{ padding: '0.4rem 0.6rem' }}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                </button>
            </div>

            <div className="library-controls-group">
                <label>Format:</label>
                <select value={formatFilter} onChange={handleFormatFilter} className="library-select">
                    <option value="">All Formats</option>
                    <option value="epub">EPUB</option>
                    <option value="txt">TXT</option>
                </select>
            </div>
        </div>
    );
};
