import React, { useEffect } from 'react';
import type { Spread } from '../../pagination/page-model';
import { usePdfDocument } from './pdf/PdfDocumentProvider';
import { useCbzDocument } from './cbz/CbzDocumentProvider';
import { PdfRenderCache } from './pdf/PdfRenderCache';
import { useResources } from './ResourceContext';
import type { ImageElement } from '../../pagination/page-model';

interface Props {
    spreads: Spread[];
    currentIndex: number;
    turnDirection: 'forward' | 'backward' | null;
    zoomLevel: number;
}

export const ReaderPreloader: React.FC<Props> = ({ spreads, currentIndex, turnDirection, zoomLevel }) => {
    const { documentHandle: pdfHandle, documentSourceId: pdfSourceId } = usePdfDocument();
    const { documentHandle: cbzHandle, documentSourceId: cbzSourceId } = useCbzDocument();
    const { resources } = useResources();
    
    // Background preloader logic
    useEffect(() => {
        if (!pdfHandle && !cbzHandle) return;
        
        let isActive = true;
        
        const preloadPdfPage = async (pageIndex: number) => {
            if (!pdfHandle || !pdfSourceId) return;
            if (pageIndex < 0 || pageIndex >= pdfHandle.getPageCount()) return;
            
            // Limit zoom scale for canvas caching, matching PdfPageRenderer
            const safeZoomLevel = Math.min(zoomLevel, 4.0);
            const cacheKey = PdfRenderCache.getCacheKey(pdfSourceId, pageIndex, safeZoomLevel);
            
            // Try to pre-render
            try {
                // If it's already cached or in-flight, getOrRender handles it seamlessly
                await PdfRenderCache.getOrRender(cacheKey, async (targetCanvas) => {
                    const pdfPage = await pdfHandle.getPage(pageIndex);
                    if (!isActive) return;
                    await pdfPage.render(targetCanvas, safeZoomLevel);
                });
            } catch (e) {
                // Silently fail preload
                console.debug('Preload failed for page', pageIndex, e);
            }
        };

        const preloadCbzPage = async (pageIndex: number) => {
            if (!cbzHandle) return;
            if (pageIndex < 0 || pageIndex >= cbzHandle.getPageCount()) return;
            
            try {
                const cbzPage = await cbzHandle.getPage(pageIndex);
                if (!isActive) return;
                const url = await cbzPage.renderToBlobUrl();
                // Create an image to force the browser to decode and cache the pixel data
                if (url && isActive) {
                    const img = new Image();
                    img.src = url;
                }
            } catch (e) {
                console.debug('CBZ Preload failed for page', pageIndex, e);
            }
        };

        const runPreload = async () => {
            // Determine which spreads to preload
            const targetIndices: number[] = [];
            
            // Always preload next 2 spreads if moving forward or default
            if (turnDirection === 'forward' || !turnDirection) {
                targetIndices.push(currentIndex + 1);
                targetIndices.push(currentIndex + 2);
                targetIndices.push(currentIndex - 1);
            } else if (turnDirection === 'backward') {
                targetIndices.push(currentIndex - 1);
                targetIndices.push(currentIndex - 2);
                targetIndices.push(currentIndex + 1);
            }
            
            // For each target spread, preload its left/right PDF pages
            for (const spreadIndex of targetIndices) {
                if (spreadIndex >= 0 && spreadIndex < spreads.length) {
                    const spread = spreads[spreadIndex];
                    if (!isActive) break;
                    
                    const promises: Promise<void>[] = [];
                    
                    // PDF and CBZ Preloading
                    if (spread.leftPage?.type === 'fixed') {
                        if (spread.leftPage.format === 'cbz') {
                            promises.push(preloadCbzPage(spread.leftPage.pageIndex));
                        } else {
                            promises.push(preloadPdfPage(spread.leftPage.pageIndex));
                        }
                    }
                    if (spread.rightPage?.type === 'fixed') {
                        if (spread.rightPage.format === 'cbz') {
                            promises.push(preloadCbzPage(spread.rightPage.pageIndex));
                        } else {
                            promises.push(preloadPdfPage(spread.rightPage.pageIndex));
                        }
                    }

                    // EPUB Image Preloading
                    const preloadEpubImages = (page: any) => {
                        if (page?.type === 'reflowable' && page.elements) {
                            for (const el of page.elements) {
                                if (el.type === 'image' && (el as ImageElement).resourceId) {
                                    const res = resources[(el as ImageElement).resourceId];
                                    if (res && res.url) {
                                        // Instantiate an Image to force browser to decode it
                                        const img = new Image();
                                        img.src = res.url;
                                    }
                                }
                            }
                        }
                    };

                    preloadEpubImages(spread.leftPage);
                    preloadEpubImages(spread.rightPage);
                    
                    // Preload pages in this spread concurrently
                    if (promises.length > 0) {
                        await Promise.allSettled(promises);
                    }
                }
            }
        };

        // Run at low priority
        const timeoutId = setTimeout(runPreload, 150);

        return () => {
            isActive = false;
            clearTimeout(timeoutId);
        };
    }, [pdfHandle, pdfSourceId, cbzHandle, cbzSourceId, currentIndex, turnDirection, zoomLevel, spreads, resources]);

    return null;
};
