import React, { useEffect, useRef, useState } from 'react';
import type { FixedPresentationPage } from '../../../pagination/page-model';
import { usePdfDocument } from './PdfDocumentProvider';
import { PdfRenderCache } from './PdfRenderCache';
import type { SearchMatch } from '../../../reader/search';

interface Props {
    page: FixedPresentationPage;
    zoomLevel: number;
    searchMatch?: SearchMatch;
    allSearchMatches?: SearchMatch[];
}

export const PdfPageRenderer: React.FC<Props> = (props) => {
    const { page, zoomLevel, searchMatch, allSearchMatches } = props;
    const { documentHandle, isLoading: isDocLoading, error: docError, documentSourceId } = usePdfDocument();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    
    // We use a token to ignore stale renders if rapidly turning pages or zooming
    const renderTokenRef = useRef(0);

    // Provide a safe max zoom for canvas backing store.
    // CSS zoom will still apply visually via ReaderViewport, but we limit the canvas resolution.
    const safeZoomLevel = Math.min(zoomLevel, 4.0);

    useEffect(() => {
        if (!documentHandle || !canvasRef.current) return;
        
        let isCancelled = false;
        const currentToken = ++renderTokenRef.current;
        
        const renderPage = async () => {
            try {
                setIsRendering(true);
                setRenderError(null);
                
                const pdfPage = await documentHandle.getPage(page.pageIndex);
                if (isCancelled || currentToken !== renderTokenRef.current || !canvasRef.current) return;
                
                const userRotation = (page.rotation || 0) - (pdfPage.rotation || 0);

                const cacheKey = PdfRenderCache.getCacheKey(
                    documentSourceId || 'doc', 
                    page.pageIndex, 
                    safeZoomLevel
                ) + `-rot${userRotation}`;

                const cachedCanvas = await PdfRenderCache.getOrRender(cacheKey, async (targetCanvas) => {
                    await pdfPage.render(targetCanvas, safeZoomLevel, userRotation);
                });
                
                if (isCancelled || currentToken !== renderTokenRef.current) return;
                
                // Draw cached canvas onto our DOM canvas
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    canvasRef.current.width = cachedCanvas.width;
                    canvasRef.current.height = cachedCanvas.height;
                    canvasRef.current.style.width = cachedCanvas.style.width;
                    canvasRef.current.style.height = cachedCanvas.style.height;
                    ctx.drawImage(cachedCanvas, 0, 0);
                }
                
            } catch (err: any) {
                if (!isCancelled && currentToken === renderTokenRef.current) {
                    console.error('Failed to render PDF page:', err);
                    setRenderError('Failed to render page');
                }
            } finally {
                if (!isCancelled && currentToken === renderTokenRef.current) {
                    setIsRendering(false);
                }
            }
        };

        renderPage();

        return () => {
            isCancelled = true;
        };
    }, [documentHandle, page.pageIndex, safeZoomLevel]);

    interface MatchRectGroup {
        isActive: boolean;
        rects: {x: number, y: number, width: number, height: number}[];
    }
    const [highlightGroups, setHighlightGroups] = useState<MatchRectGroup[]>([]);
    const [debugItems, setDebugItems] = useState<{x: number, y: number, width: number, height: number}[]>([]);

    useEffect(() => {
        if (!documentHandle || (!searchMatch && (!allSearchMatches || allSearchMatches.length === 0))) {
            setHighlightGroups([]);
            setDebugItems([]);
            return;
        }
        
        const fetchHighlights = async () => {
            try {
                const pdfPage = await documentHandle.getPage(page.pageIndex);
                
                const matchesToProcess = allSearchMatches || (searchMatch ? [searchMatch] : []);
                const groups: MatchRectGroup[] = [];
                
                for (const match of matchesToProcess) {
                    if (match.pdfMatchRects) {
                        const rects = await pdfPage.getHighlightRects(match.pdfMatchRects, 1.0);
                        groups.push({
                            isActive: match.id === searchMatch?.id,
                            rects
                        });
                    }
                }
                
                setHighlightGroups(groups);
            } catch (e) {
                console.error("Failed to fetch highlight rects", e);
            }
        };
        fetchHighlights();
    }, [documentHandle, page.pageIndex, searchMatch, allSearchMatches, safeZoomLevel]);

    if (docError) {
        return (
            <div style={{ width: `${page.width}px`, height: `${page.height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', color: 'red' }}>
                Document error: {docError}
            </div>
        );
    }

    if (isDocLoading) {
        return (
            <div style={{ width: `${page.width}px`, height: `${page.height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
                Loading document...
            </div>
        );
    }

    return (
        <div style={{ 
            width: `${page.width}px`, 
            height: `${page.height}px`, 
            position: 'relative', 
            overflow: 'hidden',
            backgroundColor: '#ffffff'
        }}>
            <canvas 
                ref={canvasRef}
                style={{
                    display: 'block'
                }}
            />
            {debugItems.map((rect, i) => (
                <div key={`debug-${i}`} style={{
                    position: 'absolute',
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    border: '1px solid blue',
                    pointerEvents: 'none',
                    zIndex: 1
                }} />
            ))}
            {highlightGroups.map((group, groupIdx) => (
                group.rects.map((rect, rectIdx) => (
                    <div key={`${groupIdx}-${rectIdx}`} style={{
                        position: 'absolute',
                        left: `${rect.x}px`,
                        top: `${rect.y}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                        backgroundColor: group.isActive ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 0, 0.15)',
                        border: group.isActive ? '1px solid rgba(255, 200, 0, 0.8)' : 'none',
                        pointerEvents: 'none',
                        zIndex: 2
                    }} />
                ))
            ))}
            {isRendering && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    pointerEvents: 'none'
                }}>
                    Rendering...
                </div>
            )}
            {renderError && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#fff',
                    color: 'red'
                }}>
                    {renderError}
                </div>
            )}
        </div>
    );
};
