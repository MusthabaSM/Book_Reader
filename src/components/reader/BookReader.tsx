import React, { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import type { PaginationResult } from '../../pagination/paginator';
import { readerReducer } from '../../reader/state';
import { ReaderViewport } from './ReaderViewport';
import { AnimatedSpreadRenderer } from './AnimatedSpreadRenderer';
import { ReaderHeader } from './ReaderHeader';
import { ReaderHUD } from './ReaderHUD';
import { ReaderSearchHUD } from './ReaderSearchHUD';
import { SearchExecutor } from './SearchExecutor';
import { PdfDocumentProvider } from './pdf/PdfDocumentProvider';
import { CbzDocumentProvider } from './cbz/CbzDocumentProvider';
import { ResourceProvider } from './ResourceContext';
import { ReaderPreloader } from './ReaderPreloader';
import { TocModal } from './TocModal';
import type { DocumentSource } from '../../library/repository';
import type { PresentationPage } from '../../pagination/page-model';
import type { DocumentContent } from '../../book/models';

interface Props {
    paginationResult: PaginationResult;
    resolveDocumentSource?: (documentSourceId: string) => Promise<DocumentSource>;
    initialSpreadIndex?: number;
    onProgressUpdate?: (payload: { page: PresentationPage, spreadIndex: number }) => void;
    bookContent?: DocumentContent;
    onClose: () => void;
    bookTitle: string;
    singlePageMode: boolean;
    onToggleSinglePage: () => void;
    onRotate: () => void;
}

export const BookReader: React.FC<Props> = ({ paginationResult, resolveDocumentSource, initialSpreadIndex, onProgressUpdate, bookContent, onClose, bookTitle, singlePageMode, onToggleSinglePage, onRotate }) => {
    const [state, dispatch] = useReducer(readerReducer, {
        spreads: paginationResult.spreads,
        totalSpreads: paginationResult.spreads.length,
        currentSpreadIndex: 0,
        zoomLevel: 1.0,
        isTurning: false,
        turnDirection: null,
        nextSpreadIndex: null,
        turnId: 0,
        searchQuery: null,
        searchResults: [],
        currentSearchMatchIndex: 0,
        isSearchVisible: false,
        isSearching: false
    });

    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let maxH = 0;
        let maxW = 0;
        
        for (const spread of paginationResult.spreads) {
            const leftHeight = spread.leftPage?.type === 'fixed' ? spread.leftPage.height : 0;
            const rightHeight = spread.rightPage?.type === 'fixed' ? spread.rightPage.height : 0;
            const h = Math.max(leftHeight, rightHeight) || paginationResult.config.pageHeight;
            
            const leftWidth = spread.leftPage?.type === 'fixed' ? spread.leftPage.width : (spread.leftPage ? paginationResult.config.pageWidth : 0);
            const rightWidth = spread.rightPage?.type === 'fixed' ? spread.rightPage.width : (spread.rightPage ? paginationResult.config.pageWidth : 0);
            const w = leftWidth + rightWidth;
            
            maxH = Math.max(maxH, h);
            maxW = Math.max(maxW, w);
        }

        const calculateFitZoom = (width: number, height: number) => {
            if (maxH > 0 && maxW > 0 && width > 0 && height > 0) {
                const availableWidth = width - 40; // Horizontal padding buffer
                const zoomHeight = height / maxH;
                const zoomWidth = maxW > 0 ? availableWidth / maxW : zoomHeight;
                const fitZoom = Math.min(zoomHeight, zoomWidth);
                return Math.max(0.1, Math.min(fitZoom, 10.0));
            }
            return 1.0;
        };

        // Determine initial zoom synchronously using the ref (available after first render)
        let initialZoom = 1.0;
        if (viewportRef.current) {
            initialZoom = calculateFitZoom(viewportRef.current.clientWidth, viewportRef.current.clientHeight);
        }
        
        dispatch({ type: 'SET_PAGINATION', result: paginationResult, initialZoom, initialSpreadIndex });

        let currentFitZoom = initialZoom;

        // Establish precision ResizeObserver to handle orientation changes, HUD toggles, etc.
        if (viewportRef.current) {
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (width === 0 || height === 0) continue;
                    
                    const newFitZoom = calculateFitZoom(width, height);
                    if (Math.abs(newFitZoom - currentFitZoom) > 0.005) {
                        currentFitZoom = newFitZoom;
                        dispatch({ type: 'SET_ZOOM', zoomLevel: newFitZoom });
                    }
                }
            });
            observer.observe(viewportRef.current);
            return () => observer.disconnect();
        }
    }, [paginationResult, initialSpreadIndex]);

    useEffect(() => {
        // Trigger onProgressUpdate when currentSpreadIndex stabilizes (after COMMIT_TURN or SET_PAGINATION)
        if (state.isTurning) return; // Wait until turn is completely finished

        if (onProgressUpdate && state.spreads.length > 0) {
            const spread = state.spreads[state.currentSpreadIndex];
            if (!spread) return;
            
            // Prefer left page, fallback to right page (e.g. cover spread)
            const activePage = spread.leftPage || spread.rightPage;
            if (activePage) {
                onProgressUpdate({ page: activePage, spreadIndex: state.currentSpreadIndex });
            }
        }
    }, [state.currentSpreadIndex, state.isTurning, state.spreads, onProgressUpdate]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [boundaryWarning, setBoundaryWarning] = useState<{ message: string, id: number } | null>(null);
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    const toc = bookContent?.toc;
    const hasToc = toc && toc.length > 0;
    const [showTocModal, setShowTocModal] = useState(false);
    const hasAutoShownToc = useRef(false);

    useEffect(() => {
        if (hasToc && !hasAutoShownToc.current) {
            setShowTocModal(true);
            hasAutoShownToc.current = true;
        }
    }, [hasToc]);

    const showWarning = useCallback((message: string) => {
        setBoundaryWarning({ message, id: Date.now() });
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = setTimeout(() => setBoundaryWarning(null), 3000);
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => console.warn(err));
        } else {
            document.exitFullscreen().catch(err => console.warn(err));
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            switch (e.key) {
                case 'ArrowRight':
                case 'PageDown':
                    e.preventDefault();
                    if (state.currentSpreadIndex >= state.totalSpreads - 1) {
                        showWarning("There is no page after this");
                    } else {
                        dispatch({ type: 'START_TURN', direction: 'forward' });
                    }
                    break;
                case 'ArrowLeft':
                case 'PageUp':
                    e.preventDefault();
                    if (state.currentSpreadIndex <= 0) {
                        showWarning("You are on the first page");
                    } else {
                        dispatch({ type: 'START_TURN', direction: 'backward' });
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    dispatch({ type: 'FIRST_SPREAD' });
                    break;
                case 'End':
                    e.preventDefault();
                    dispatch({ type: 'LAST_SPREAD' });
                    break;
                case 'f':
                case 'F':
                case 'F11':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.currentSpreadIndex, state.totalSpreads, showWarning, toggleFullscreen]);

    const handleTurnComplete = useCallback((turnId: number) => {
        dispatch({ type: 'COMMIT_TURN', turnId });
    }, []);

    if (state.spreads.length === 0) {
        return <div>No spreads to display.</div>;
    }

    const firstPage = state.spreads[0]?.leftPage || state.spreads[0]?.rightPage;
    const documentSourceId = firstPage?.type === 'fixed' ? firstPage.documentSourceId : null;

    const currentSpread = state.spreads[state.currentSpreadIndex];
    const leftWidth = currentSpread?.leftPage?.type === 'fixed' ? currentSpread.leftPage.width : (currentSpread?.leftPage ? paginationResult.config.pageWidth : 0);
    const rightWidth = currentSpread?.rightPage?.type === 'fixed' ? currentSpread.rightPage.width : (currentSpread?.rightPage ? paginationResult.config.pageWidth : 0);
    const leftHeight = currentSpread?.leftPage?.type === 'fixed' ? currentSpread.leftPage.height : 0;
    const rightHeight = currentSpread?.rightPage?.type === 'fixed' ? currentSpread.rightPage.height : 0;
    
    const spreadWidth = leftWidth + rightWidth;
    const spreadHeight = Math.max(leftHeight, rightHeight) || paginationResult.config.pageHeight;

    const handleSearchResults = useCallback((results: any[]) => {
        dispatch({ type: 'SET_SEARCH_RESULTS', results });
    }, []);

    const handleSearchComplete = useCallback(() => {
        dispatch({ type: 'SET_IS_SEARCHING', isSearching: false });
    }, []);

    let content = (
        <ResourceProvider resources={bookContent?.resources || {}}>
            <SearchExecutor 
                searchQuery={state.searchQuery}
                bookContent={bookContent}
                onResults={handleSearchResults}
                onSearchComplete={handleSearchComplete}
            />
            <ReaderViewport zoomLevel={state.zoomLevel} baseWidth={spreadWidth} baseHeight={spreadHeight}>
                <AnimatedSpreadRenderer
                    spreads={state.spreads}
                    currentIndex={state.currentSpreadIndex}
                    nextIndex={state.nextSpreadIndex}
                    isTurning={state.isTurning}
                    turnDirection={state.turnDirection}
                    turnId={state.turnId}
                    config={paginationResult.config}
                    zoomLevel={state.zoomLevel}
                    onTurnComplete={handleTurnComplete}
                    searchMatch={state.isSearchVisible && state.searchResults.length > 0 ? state.searchResults[state.currentSearchMatchIndex] : undefined}
                    allSearchMatches={state.isSearchVisible ? state.searchResults : undefined}
                />
            </ReaderViewport>
            <ReaderPreloader 
                spreads={state.spreads} 
                currentIndex={state.currentSpreadIndex} 
                turnDirection={state.turnDirection}
                zoomLevel={state.zoomLevel} 
            />
        </ResourceProvider>
    );

    if (documentSourceId && resolveDocumentSource) {
        if (bookContent?.metadata.sourceFormat === 'cbz') {
            content = (
                <CbzDocumentProvider documentSourceId={documentSourceId} resolveDocumentSource={resolveDocumentSource}>
                    {content}
                </CbzDocumentProvider>
            );
        } else {
            content = (
                <PdfDocumentProvider documentSourceId={documentSourceId} resolveDocumentSource={resolveDocumentSource}>
                    {content}
                </PdfDocumentProvider>
            );
        }
    }

    const handleSearch = useCallback((query: string) => {
        dispatch({ type: 'SET_SEARCH_QUERY', query });
        dispatch({ type: 'SET_IS_SEARCHING', isSearching: true });
    }, []);

    const touchStartRef = useRef<{ x: number, y: number } | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        
        // Only allow swipe if not zoomed in (panning takes precedence)
        if (state.zoomLevel > 1) {
            touchStartRef.current = null;
            return;
        }

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const deltaX = touchStartRef.current.x - touchEndX;
        const deltaY = Math.abs(touchStartRef.current.y - touchEndY);
        
        // Ensure it's mostly a horizontal swipe (greater than 50px)
        if (Math.abs(deltaX) > 50 && deltaY < 100) {
            if (deltaX > 0) {
                // Swiped left -> Next page
                if (state.currentSpreadIndex >= state.totalSpreads - 1) {
                    showWarning("There is no page after this");
                } else {
                    dispatch({ type: 'START_TURN', direction: 'forward' });
                }
            } else {
                // Swiped right -> Previous page
                if (state.currentSpreadIndex <= 0) {
                    showWarning("You are on the first page");
                } else {
                    dispatch({ type: 'START_TURN', direction: 'backward' });
                }
            }
        }
        
        touchStartRef.current = null;
    };

    return (
        <div 
            ref={containerRef} 
            className={`reader-shell ${isFullscreen ? 'is-fullscreen' : ''}`} 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{
                width: '100%',
                height: '100dvh',
                minWidth: 0,
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: isFullscreen ? 'var(--neutral-bg-dark, #18181B)' : 'var(--bg, #F9F8F6)',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {!isFullscreen && (
                <div style={{ flexShrink: 0, zIndex: 10 }}>
                    <ReaderHeader 
                        title={bookTitle}
                        isFullscreen={isFullscreen}
                        onClose={onClose}
                        onToggleFullscreen={toggleFullscreen}
                        singlePageMode={singlePageMode}
                        onToggleSinglePage={onToggleSinglePage}
                        onRotate={onRotate}
                    />
                </div>
            )}
            
            <div 
                ref={viewportRef}
                className="reader-content-viewport" 
                style={{ 
                    flex: 1, 
                    minHeight: 0, 
                    position: 'relative', 
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 0
                }}
            >
                <div className="reader-content" style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                    {content}
                </div>
                
                {boundaryWarning && (
                    <div key={boundaryWarning.id} className="reader-boundary-warning" style={{ zIndex: 20 }}>
                        {boundaryWarning.message}
                    </div>
                )}
            </div>
            
            <div style={{ flexShrink: 0, zIndex: 10, pointerEvents: 'none' }}>
                <ReaderHUD
                    currentSpread={state.currentSpreadIndex}
                    totalSpreads={state.totalSpreads}
                    zoomLevel={state.zoomLevel}
                    onNext={() => {
                        if (state.currentSpreadIndex >= state.totalSpreads - 1) {
                            showWarning("There is no page after this");
                        } else {
                            dispatch({ type: 'START_TURN', direction: 'forward' });
                        }
                    }}
                    onPrev={() => {
                        if (state.currentSpreadIndex <= 0) {
                            showWarning("You are on the first page");
                        } else {
                            dispatch({ type: 'START_TURN', direction: 'backward' });
                        }
                    }}
                    onGoToSpread={(index) => dispatch({ type: 'GOTO_SPREAD', index })}
                    onZoomIn={() => dispatch({ type: 'ZOOM_IN' })}
                    onZoomOut={() => dispatch({ type: 'ZOOM_OUT' })}
                    onZoomChange={(zoom) => dispatch({ type: 'SET_ZOOM', zoomLevel: zoom })}
                    onResetZoom={() => dispatch({ type: 'RESET_ZOOM' })}
                    onToggleSearch={() => dispatch({ type: 'TOGGLE_SEARCH' })}
                    onToggleToc={hasToc ? () => setShowTocModal(true) : undefined}
                />
            </div>

            <ReaderSearchHUD
                isVisible={state.isSearchVisible}
                isSearching={state.isSearching}
                matches={state.searchResults}
                currentMatchIndex={state.currentSearchMatchIndex}
                onClose={() => dispatch({ type: 'TOGGLE_SEARCH' })}
                onSearch={handleSearch}
                onNextMatch={() => dispatch({ type: 'NEXT_SEARCH_MATCH' })}
                onPrevMatch={() => dispatch({ type: 'PREV_SEARCH_MATCH' })}
            />
                
            {showTocModal && toc && (
                <div style={{ pointerEvents: 'auto', position: 'absolute', inset: 0, zIndex: 30 }}>
                    <TocModal 
                        toc={toc} 
                        onSelect={(pageIndex) => {
                            const spreadIndex = state.spreads.findIndex(s => 
                                (s.leftPage?.type === 'fixed' && s.leftPage.pageIndex === pageIndex) ||
                                (s.rightPage?.type === 'fixed' && s.rightPage.pageIndex === pageIndex)
                            );
                            if (spreadIndex >= 0) {
                                dispatch({ type: 'GOTO_SPREAD', index: spreadIndex });
                            }
                            setShowTocModal(false);
                        }} 
                        onClose={() => setShowTocModal(false)} 
                    />
                </div>
            )}
        </div>
    );
};
