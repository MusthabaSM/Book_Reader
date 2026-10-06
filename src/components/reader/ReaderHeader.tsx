import React from 'react';

interface Props {
    title: string;
    isFullscreen: boolean;
    onClose: () => void;
    onToggleFullscreen: () => void;
    singlePageMode: boolean;
    onToggleSinglePage: () => void;
    onRotate: () => void;
}

export const ReaderHeader: React.FC<Props> = ({ title, isFullscreen, onClose, onToggleFullscreen, singlePageMode, onToggleSinglePage, onRotate }) => {
    return (
        <header className="reader-header">
            <div className="reader-header-group left">
                <button onClick={onClose} className="library-btn library-btn-ghost">
                    ← Back
                </button>
            </div>
            
            <div className="reader-header-group center">
                <h1 className="reader-title">{title}</h1>
            </div>
            
            <div className="reader-header-group right" style={{ gap: '0.5rem' }}>
                <button onClick={onRotate} className="library-btn library-btn-ghost">
                    Rotate ↻
                </button>
                <button onClick={onToggleSinglePage} className="library-btn library-btn-ghost">
                    {singlePageMode ? '1-Page Mode' : '2-Page Mode'}
                </button>
                <button onClick={onToggleFullscreen} className="library-btn library-btn-ghost">
                    {isFullscreen ? 'Exit Fullscreen ⛶' : 'Fullscreen ⛶'}
                </button>
            </div>
        </header>
    );
};
