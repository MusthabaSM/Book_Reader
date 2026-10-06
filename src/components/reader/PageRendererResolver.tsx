import React from 'react';
import type { PresentationPage } from '../../pagination/page-model';
import type { PaginationConfig } from '../../pagination/layout/config';
import { PageRenderer as ReflowablePageRenderer } from './PageRenderer';
import { PdfPageRenderer } from './pdf/PdfPageRenderer';
import { CbzPageRenderer } from './cbz/CbzPageRenderer';
import type { SearchMatch } from '../../reader/search';

interface Props {
    page: PresentationPage;
    config: PaginationConfig;
    zoomLevel?: number;
    searchMatch?: SearchMatch;
    allSearchMatches?: SearchMatch[];
}

export const PageRendererResolver: React.FC<Props> = ({ page, config, zoomLevel = 1.0, searchMatch, allSearchMatches }) => {
    let validSearchMatch = searchMatch;
    if (searchMatch) {
        if (page.type === 'fixed') {
            if (searchMatch.pageOrChapterIndex !== page.pageIndex) {
                validSearchMatch = undefined;
            }
        } else if (page.type === 'reflowable') {
            const isMatch = searchMatch.pageOrChapterIndex.toString() === page.startPosition?.chapterId || page.elements.some((e: any) => e.sourceChapterId === searchMatch.pageOrChapterIndex.toString() || e.sourceBlockId === searchMatch.reflowableBlockId);
            if (!isMatch) {
                validSearchMatch = undefined;
            }
        }
    }

    let validAllSearchMatches = allSearchMatches;
    if (allSearchMatches) {
        if (page.type === 'fixed') {
            validAllSearchMatches = allSearchMatches.filter(m => m.pageOrChapterIndex === page.pageIndex);
        } else if (page.type === 'reflowable') {
            validAllSearchMatches = allSearchMatches.filter(m => 
                m.pageOrChapterIndex.toString() === page.startPosition?.chapterId || 
                page.elements.some((e: any) => e.sourceChapterId === m.pageOrChapterIndex.toString() || e.sourceBlockId === m.reflowableBlockId)
            );
        }
    }

    switch (page.type) {
        case 'reflowable':
            return <ReflowablePageRenderer page={page} config={config} searchMatch={validSearchMatch} />;
        case 'fixed':
            if (page.format === 'cbz') {
                return <CbzPageRenderer page={page} />;
            }
            return <PdfPageRenderer page={page} zoomLevel={zoomLevel} searchMatch={validSearchMatch} allSearchMatches={validAllSearchMatches} />;
        default:
            return (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red' }}>
                    Unsupported page type
                </div>
            );
    }
};
