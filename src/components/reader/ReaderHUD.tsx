import React, { useState, useEffect } from 'react';

interface Props {
    currentSpread: number;
    totalSpreads: number;
    zoomLevel: number;
    onPrev: () => void;
    onNext: () => void;
    onGoToSpread: (index: number) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomChange: (zoom: number) => void;
    onResetZoom: () => void;
    onToggleSearch: () => void;
    onToggleToc?: () => void;
}

export const ReaderHUD: React.FC<Props> = ({
    currentSpread, totalSpreads, zoomLevel, onPrev, onNext, onGoToSpread, onZoomIn, onZoomOut, onZoomChange, onResetZoom, onToggleSearch, onToggleToc
}) => {
    const [zoomInputValue, setZoomInputValue] = useState(`${Math.round(zoomLevel * 100)}`);
    const [pageInputValue, setPageInputValue] = useState(`${currentSpread + 1}`);
    const [isVisible, setIsVisible] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const resetTimeout = React.useCallback(() => {
        setIsVisible(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (!isHovering) {
            timeoutRef.current = setTimeout(() => {
                setIsVisible(false);
            }, 3000);
        }
    }, [isHovering]);

    useEffect(() => {
        resetTimeout();
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [resetTimeout]);

    useEffect(() => {
        const handleInteraction = (e: MouseEvent | TouchEvent) => {
            let clientY = 0;
            if ('touches' in e) {
                if (e.touches.length > 0) {
                    clientY = e.touches[0].clientY;
                }
            } else {
                clientY = (e as MouseEvent).clientY;
            }
            
            // Only trigger if interaction is near the bottom
            if (clientY > window.innerHeight - 150) {
                if (!isHovering) {
                    resetTimeout();
                }
            }
        };
        window.addEventListener('mousemove', handleInteraction);
        window.addEventListener('touchstart', handleInteraction, { passive: true });
        return () => {
            window.removeEventListener('mousemove', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
        };
    }, [isHovering, resetTimeout]);

    useEffect(() => {
        setZoomInputValue(`${Math.round(zoomLevel * 100)}`);
    }, [zoomLevel]);

    useEffect(() => {
        setPageInputValue(`${currentSpread + 1}`);
    }, [currentSpread]);

    const handleZoomSubmit = () => {
        const parsed = parseInt(zoomInputValue, 10);
        if (!isNaN(parsed) && parsed > 0) {
            onZoomChange(parsed / 100);
        } else {
            setZoomInputValue(`${Math.round(zoomLevel * 100)}`);
        }
    };

    const handleZoomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleZoomSubmit();
            (e.target as HTMLInputElement).blur();
        }
    };

    const handlePageSubmit = () => {
        const parsed = parseInt(pageInputValue, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= totalSpreads) {
            onGoToSpread(parsed - 1);
        } else {
            setPageInputValue(`${currentSpread + 1}`);
        }
    };

    const handlePageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handlePageSubmit();
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="reader-hud-wrapper">
            <div 
                className="reader-hud"
                onMouseEnter={() => {
                    if (window.matchMedia('(hover: hover)').matches) {
                        setIsHovering(true);
                    }
                }}
                onMouseLeave={() => setIsHovering(false)}
                onTouchStart={() => resetTimeout()}
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                    pointerEvents: isVisible ? 'auto' : 'none'
                }}
            >
                <div className="reader-hud-group nav-group">
                    <button onClick={onPrev} className="library-btn library-btn-secondary">
                        ‹
                    </button>
                    <div className="reader-page-input-wrapper">
                        <input 
                            type="text" 
                            value={pageInputValue} 
                            onChange={(e) => setPageInputValue(e.target.value)}
                            onBlur={handlePageSubmit}
                            onKeyDown={handlePageKeyDown}
                            className="library-input reader-page-input"
                        />
                        <span className="reader-hud-text"> / {totalSpreads}</span>
                    </div>
                    <button onClick={onNext} className="library-btn library-btn-secondary">
                        ›
                    </button>
                </div>
                
                <div className="reader-hud-group zoom-group">
                    {onToggleToc && (
                        <button onClick={onToggleToc} className="library-btn library-btn-ghost reader-hud-reset" title="Table of Contents">
                            📑
                        </button>
                    )}
                    <button onClick={onToggleSearch} className="library-btn library-btn-ghost reader-hud-reset" title="Search">
                        🔍
                    </button>
                    <button onClick={onZoomOut} className="library-btn library-btn-secondary">−</button>
                    <div className="reader-zoom-input-wrapper">
                        <input 
                            type="text" 
                            value={zoomInputValue} 
                            onChange={(e) => setZoomInputValue(e.target.value)}
                            onBlur={handleZoomSubmit}
                            onKeyDown={handleZoomKeyDown}
                            className="library-input reader-zoom-input"
                        />
                        <span className="reader-hud-text">%</span>
                    </div>
                    <button onClick={onZoomIn} className="library-btn library-btn-secondary">+</button>
                    <button onClick={onResetZoom} className="library-btn library-btn-ghost reader-hud-reset">Reset</button>
                </div>
            </div>
        </div>
    );
};
