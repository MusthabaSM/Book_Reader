import React, { useEffect, useState } from 'react';
import type { Spread, PresentationPage } from '../../pagination/page-model';
import type { PaginationConfig } from '../../pagination/layout/config';
import { PageRendererResolver } from './PageRendererResolver';
import { defaultPageTurnConfig } from '../../animation/gsap/config';
import { getPresentationPageWidth, getPresentationPageHeight } from './page-geometry';
import { PhysicalPageTurn } from './PhysicalPageTurn';

// --- Book Shell: wraps the spread in a realistic open-book frame ---
const COVER_PAD = 10;       // how much the cover sticks out
const PAGE_EDGE_COUNT = 5;  // number of visible stacked page lines
const COVER_COLOR = '#e0e0e0';     // light grey
const COVER_HIGHLIGHT = '#ececec'; // slightly lighter grey
const PAGE_EDGE_COLOR = '#f0eeea'; // off-white page edges
const PAGE_EDGE_SHADOW = '#d5d3cf'; // slightly darker edge

const BookShell: React.FC<{ spreadWidth: number; maxHeight: number; spineX: number; isTurning?: boolean; children: React.ReactNode }> = ({
    spreadWidth, maxHeight, spineX, isTurning = false, children
}) => {
    const totalW = spreadWidth + COVER_PAD * 2;
    const totalH = maxHeight + COVER_PAD * 2;

    // Build stacked page edge lines for each side
    const pageEdges: React.ReactNode[] = [];
    for (let i = 0; i < PAGE_EDGE_COUNT; i++) {
        const offset = COVER_PAD - 1 - i * 1.4;
        const edgeColor = i === 0 ? PAGE_EDGE_SHADOW : PAGE_EDGE_COLOR;
        // Left outer edge
        pageEdges.push(
            <div key={`le-${i}`} style={{
                position: 'absolute', left: offset, top: COVER_PAD + 2, width: '1px',
                height: maxHeight - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
        // Right outer edge
        pageEdges.push(
            <div key={`re-${i}`} style={{
                position: 'absolute', right: offset, top: COVER_PAD + 2, width: '1px',
                height: maxHeight - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
        // Top edge (left half)
        pageEdges.push(
            <div key={`tl-${i}`} style={{
                position: 'absolute', left: COVER_PAD + 2, top: offset, height: '1px',
                width: spineX - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
        // Top edge (right half)
        pageEdges.push(
            <div key={`tr-${i}`} style={{
                position: 'absolute', left: COVER_PAD + spineX + 2, top: offset, height: '1px',
                width: spreadWidth - spineX - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
        // Bottom edge (left half)
        pageEdges.push(
            <div key={`bl-${i}`} style={{
                position: 'absolute', left: COVER_PAD + 2, bottom: offset, height: '1px',
                width: spineX - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
        // Bottom edge (right half)
        pageEdges.push(
            <div key={`br-${i}`} style={{
                position: 'absolute', left: COVER_PAD + spineX + 2, bottom: offset, height: '1px',
                width: spreadWidth - spineX - 4, backgroundColor: edgeColor, zIndex: 1
            }} />
        );
    }

    return (
        <div style={{
            position: 'relative', width: totalW, height: totalH,
            borderRadius: '4px 4px 4px 4px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            overflow: 'hidden'
        }}>
            {/* Book cover background */}
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '4px',
                background: `linear-gradient(135deg, ${COVER_HIGHLIGHT} 0%, ${COVER_COLOR} 30%, ${COVER_COLOR} 70%, ${COVER_HIGHLIGHT} 100%)`,
            }} />

            {/* Spine cover strip (the binding) - hidden during turns */}
            {!isTurning && <div style={{
                position: 'absolute',
                left: COVER_PAD + spineX - 4,
                top: 0,
                width: 8,
                height: totalH,
                background: `linear-gradient(to right, #d0d0d0, #b8b8b8, #d0d0d0)`,
                zIndex: 3, borderRadius: '0'
            }} />}

            {/* Stacked page edges */}
            {pageEdges}

            {/* Page content area */}
            <div style={{
                position: 'absolute',
                left: COVER_PAD,
                top: COVER_PAD,
                width: spreadWidth,
                height: maxHeight,
                zIndex: 2,
                overflow: 'visible'
            }}>
                {children}
            </div>
        </div>
    );
};

// --- Spine shadow overlays (applied on each page) ---
const SpineShadowLeft: React.FC = () => (
    <div style={{
        position: 'absolute', right: 0, top: 0, width: '40px', height: '100%',
        background: 'linear-gradient(to left, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.07) 30%, rgba(0,0,0,0) 100%)',
        pointerEvents: 'none', zIndex: 2
    }} />
);
const SpineShadowRight: React.FC = () => (
    <div style={{
        position: 'absolute', left: 0, top: 0, width: '40px', height: '100%',
        background: 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.07) 30%, rgba(0,0,0,0) 100%)',
        pointerEvents: 'none', zIndex: 2
    }} />
);
import type { SearchMatch } from '../../reader/search';
interface Props {
    spreads: Spread[];
    currentIndex: number;
    nextIndex: number | null;
    isTurning: boolean;
    turnDirection: 'forward' | 'backward' | null;
    turnId: number;
    config: PaginationConfig;
    zoomLevel: number;
    onTurnComplete: (turnId: number) => void;
    searchMatch?: SearchMatch;
    allSearchMatches?: SearchMatch[];
}

export const AnimatedSpreadRenderer: React.FC<Props> = ({
    spreads,
    currentIndex,
    nextIndex,
    isTurning,
    turnDirection,
    turnId,
    config,
    zoomLevel,
    onTurnComplete,
    searchMatch
}) => {
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const currentSpread = spreads[currentIndex];
    
    if (!isTurning || nextIndex === null) {
        const leftWidth = getPresentationPageWidth(currentSpread?.leftPage || null, config);
        const rightWidth = getPresentationPageWidth(currentSpread?.rightPage || null, config);
        const leftHeight = getPresentationPageHeight(currentSpread?.leftPage || null, config);
        const rightHeight = getPresentationPageHeight(currentSpread?.rightPage || null, config);
        const spreadWidth = leftWidth + rightWidth;
        const maxHeight = Math.max(leftHeight, rightHeight);

        return (
            <BookShell spreadWidth={spreadWidth} maxHeight={maxHeight} spineX={leftWidth}>
                <div style={{ display: 'flex', flexDirection: 'row', width: `${spreadWidth}px`, height: `${maxHeight}px`, position: 'relative' }}>
                    {/* Left page */}
                    <div style={{ width: `${leftWidth}px`, height: `${maxHeight}px`, position: 'relative' }}>
                        {currentSpread?.leftPage ? <PageRendererResolver page={currentSpread.leftPage} config={config} zoomLevel={zoomLevel} searchMatch={searchMatch} /> : <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />}
                        <SpineShadowLeft />
                    </div>
                    {/* Spine crease */}
                    <div className="spine-line" style={{ position: 'absolute', left: `${leftWidth}px`, top: 0, bottom: 0, width: '2px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.25), rgba(0,0,0,0.12))', zIndex: 10 }} />
                    {/* Right page */}
                    <div style={{ width: `${rightWidth}px`, height: `${maxHeight}px`, position: 'relative' }}>
                        {currentSpread?.rightPage ? <PageRendererResolver page={currentSpread.rightPage} config={config} zoomLevel={zoomLevel} searchMatch={searchMatch} /> : <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />}
                        <SpineShadowRight />
                    </div>
                </div>
            </BookShell>
        );
    }

    const nextSpread = spreads[nextIndex];
    const isSinglePageMode = config.forceSinglePage === true;
    const isForward = turnDirection === 'forward';

    let bgLeftPage: PresentationPage | null = null;
    let bgRightPage: PresentationPage | null = null;
    let frontFacePage: PresentationPage | null = null;
    let backFacePage: PresentationPage | null = null;

    if (isSinglePageMode) {
        // Single page mode (right side bound).
        bgLeftPage = null;
        if (isForward) {
            bgRightPage = nextSpread.rightPage;
            frontFacePage = currentSpread.rightPage;
            backFacePage = nextSpread.rightPage;
        } else {
            // Backward turn in 1-page mode: peel the current page from left to right, revealing the previous page.
            bgRightPage = nextSpread.rightPage; // Target page
            frontFacePage = currentSpread.rightPage; // Peeling page
            backFacePage = nextSpread.rightPage; // Back of peeling flap
        }
    } else {
        // Two-page spread mode
        bgLeftPage = isForward ? currentSpread.leftPage : nextSpread.leftPage;
        bgRightPage = isForward ? nextSpread.rightPage : currentSpread.rightPage;

        // For forward turn, we peel the right page. For backward, we peel the left page.
        frontFacePage = isForward ? currentSpread.rightPage : currentSpread.leftPage;
        backFacePage = isForward ? nextSpread.leftPage : nextSpread.rightPage;

        // Safety for single-page mode edge cases in 2-page layout (if one side is empty)
        if (isForward && !backFacePage && frontFacePage) {
            backFacePage = frontFacePage;
        } else if (!isForward && !frontFacePage && backFacePage) {
            frontFacePage = backFacePage;
        }
    }

    const bgLeftWidth = getPresentationPageWidth(bgLeftPage || null, config);
    const bgRightWidth = getPresentationPageWidth(bgRightPage || null, config);
    const bgLeftHeight = getPresentationPageHeight(bgLeftPage || null, config);
    const bgRightHeight = getPresentationPageHeight(bgRightPage || null, config);
    
    const turnFrontWidth = getPresentationPageWidth(frontFacePage || null, config);
    const turnBackWidth = getPresentationPageWidth(backFacePage || null, config);
    const turnFrontHeight = getPresentationPageHeight(frontFacePage || null, config);
    const turnBackHeight = getPresentationPageHeight(backFacePage || null, config);
    
    const spreadWidth = bgLeftWidth + bgRightWidth;
    const maxHeight = Math.max(bgLeftHeight, bgRightHeight);
    const spineX = bgLeftWidth;
    const turnWidth = isForward ? turnFrontWidth : turnBackWidth;
    const turnHeight = Math.max(turnFrontHeight, turnBackHeight);
    
    return (
        <BookShell spreadWidth={spreadWidth} maxHeight={maxHeight} spineX={spineX} isTurning={true}>
            <div style={{ 
                width: `${spreadWidth}px`, 
                height: `${maxHeight}px`,
                position: 'relative',
                perspective: `${defaultPageTurnConfig.perspective}px`
            }}>
                <div style={{ width: `${bgLeftWidth}px`, height: `${bgLeftHeight}px`, position: 'absolute', left: 0, top: 0 }}>
                    {bgLeftPage ? <PageRendererResolver page={bgLeftPage} config={config} zoomLevel={zoomLevel} searchMatch={searchMatch} /> : <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />}
                </div>

                <div style={{ width: `${bgRightWidth}px`, height: `${bgRightHeight}px`, position: 'absolute', left: `${spineX}px`, top: 0 }}>
                    {bgRightPage ? <PageRendererResolver page={bgRightPage} config={config} zoomLevel={zoomLevel} searchMatch={searchMatch} /> : <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />}
                </div>

                <div style={{ position: 'absolute', left: 0, top: 0, zIndex: 10 }}>
                    <PhysicalPageTurn
                        spineX={spineX}
                        frontPage={frontFacePage}
                        backPage={backFacePage}
                        width={turnWidth}
                        height={turnHeight}
                        direction={isForward ? 'forward' : 'backward'}
                        isTurning={isTurning}
                        turnId={turnId}
                        config={config}
                        zoomLevel={zoomLevel}
                        reducedMotion={reducedMotion}
                        onTurnComplete={onTurnComplete}
                        totalSpreads={spreads.length}
                        spreadIndex={currentIndex}
                        bookId={
                            spreads[0]?.leftPage?.type === 'fixed' ? spreads[0].leftPage.documentSourceId :
                            spreads[0]?.leftPage?.type === 'reflowable' ? spreads[0].leftPage.startPosition.bookId :
                            spreads[0]?.rightPage?.type === 'fixed' ? spreads[0].rightPage.documentSourceId :
                            spreads[0]?.rightPage?.type === 'reflowable' ? spreads[0].rightPage.startPosition.bookId :
                            'unknown'
                        }
                    />
                </div>
            </div>
        </BookShell>
    );
};
