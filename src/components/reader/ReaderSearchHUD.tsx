import React, { useState, useEffect, useRef } from 'react';
import type { SearchMatch } from '../../reader/search';

interface Props {
    isVisible: boolean;
    onClose: () => void;
    onSearch: (query: string) => void;
    matches: SearchMatch[];
    currentMatchIndex: number;
    onNextMatch: () => void;
    onPrevMatch: () => void;
    isSearching: boolean;
}

export const ReaderSearchHUD: React.FC<Props> = ({
    isVisible,
    onClose,
    onSearch,
    matches,
    currentMatchIndex,
    onNextMatch,
    onPrevMatch,
    isSearching
}) => {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isVisible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isVisible]);

    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            onSearch(inputValue);
        }, 500); // Debounce search
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [inputValue, onSearch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                onPrevMatch();
            } else {
                onNextMatch();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isVisible) return null;

    return (
        <div className="reader-search-hud" style={{ pointerEvents: 'auto' }}>
            <div className="reader-search-container">
                <input
                    ref={inputRef}
                    type="text"
                    className="library-input reader-search-input"
                    placeholder="Search in book..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                
                {inputValue && (
                    <div className="reader-search-results">
                        {isSearching ? (
                            <span className="reader-search-count">Searching...</span>
                        ) : matches.length > 0 ? (
                            <div className="reader-search-nav">
                                <span className="reader-search-count">
                                    {currentMatchIndex + 1} of {matches.length}
                                </span>
                                <button onClick={onPrevMatch} className="library-btn library-btn-secondary" title="Previous match (Shift+Enter)">
                                    ↑
                                </button>
                                <button onClick={onNextMatch} className="library-btn library-btn-secondary" title="Next match (Enter)">
                                    ↓
                                </button>
                            </div>
                        ) : (
                            <span className="reader-search-count">No matches</span>
                        )}
                    </div>
                )}
                
                <button onClick={onClose} className="library-btn library-btn-secondary reader-search-close">
                    ✕
                </button>
            </div>
        </div>
    );
};
