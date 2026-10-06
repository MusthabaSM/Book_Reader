import type { Book } from '../../book/models';
import type { PaginationConfig } from '../layout/config';
import { getAvailableWidth, getAvailableHeight } from '../layout/config';
import type { TextMeasurer } from '../layout/measurer';
import type { ReflowablePresentationPage, Spread, PageElement, ReflowablePosition } from '../page-model';
import { BlockLayoutEngine, type LayoutContext } from './layout-engine';

export interface PaginationResult {
    pages: ReflowablePresentationPage[];
    spreads: Spread[];
    pageCount: number;
    warnings: string[];
    config: PaginationConfig;
}

export class Paginator {
    private layoutEngine = new BlockLayoutEngine();

    public paginate(book: Book, config: PaginationConfig, measurer: TextMeasurer): PaginationResult {
        const pages: ReflowablePresentationPage[] = [];
        const availableWidth = getAvailableWidth(config);
        const availableHeight = getAvailableHeight(config);
        
        let currentPageElements: PageElement[] = [];
        let currentY = 0;
        let pageNumber = 1;
        
        let startPos: ReflowablePosition | null = null;
        let lastPos: ReflowablePosition | null = null;

        const finalizePage = () => {
            if (currentPageElements.length > 0 || pages.length === 0) {
                const pageStartPos: ReflowablePosition = startPos || { type: 'reflowable', bookId: book.id, chapterId: '', blockId: '' };
                const pageEndPos: ReflowablePosition = lastPos || pageStartPos;

                pages.push({
                    type: 'reflowable',
                    id: `page-${pageNumber}`,
                    pageNumber,
                    elements: [...currentPageElements],
                    startPosition: pageStartPos,
                    endPosition: pageEndPos
                });
                pageNumber++;
            }
            currentPageElements = [];
            currentY = 0;
            startPos = null;
        };

        for (const chapter of book.chapters) {
            for (const block of chapter.blocks) {
                if (block.type === 'page-break') {
                    if (currentPageElements.length > 0) {
                        finalizePage();
                    }
                    continue;
                }

                const context: LayoutContext = { bookId: book.id, chapterId: chapter.id, config, measurer, availableWidth };
                const layoutResult = this.layoutEngine.layoutBlock(block, context);

                if (layoutResult.elements.length === 0) continue;

                const blockStartPos: ReflowablePosition = { type: 'reflowable', bookId: book.id, chapterId: chapter.id, blockId: block.id, inlineOffset: 0 };
                if (!startPos) startPos = blockStartPos;

                if (!layoutResult.canSplit && currentY + layoutResult.totalHeight > availableHeight && currentY > 0) {
                    finalizePage();
                    startPos = blockStartPos;
                }

                if (!layoutResult.canSplit || currentY + layoutResult.totalHeight <= availableHeight) {
                    for (const el of layoutResult.elements) {
                        const newEl = { ...el, geometry: { ...el.geometry, y: el.geometry.y + currentY } };
                        currentPageElements.push(newEl);
                    }
                    currentY += layoutResult.totalHeight;
                    lastPos = { type: 'reflowable', bookId: book.id, chapterId: chapter.id, blockId: block.id };
                } else {
                    // Split the block
                    let blockYOffset = 0;
                    
                    for (const el of layoutResult.elements) {
                        if (currentY + (el.geometry.y - blockYOffset) + el.geometry.height > availableHeight && currentPageElements.length > 0) {
                            finalizePage();
                            startPos = { 
                                type: 'reflowable',
                                bookId: book.id, 
                                chapterId: chapter.id, 
                                blockId: block.id, 
                                inlineOffset: (el as any).sourceInlineStart || 0 
                            };
                            blockYOffset = el.geometry.y;
                        }
                        
                        const newEl = { 
                            ...el, 
                            geometry: { 
                                ...el.geometry, 
                                y: el.geometry.y - blockYOffset + currentY 
                            } 
                        };
                        currentPageElements.push(newEl);
                        lastPos = { 
                            type: 'reflowable',
                            bookId: book.id, 
                            chapterId: chapter.id, 
                            blockId: block.id, 
                            inlineOffset: (el as any).sourceInlineEnd || 0 
                        };
                    }
                    
                    currentY += (layoutResult.totalHeight - blockYOffset);
                }
            }
        }

        finalizePage();
        const spreads = this.generateSpreads(pages);

        return {
            pages,
            spreads,
            pageCount: pages.length,
            warnings: [],
            config
        };
    }

    private generateSpreads(pages: ReflowablePresentationPage[]): Spread[] {
        const spreads: Spread[] = [];
        let spreadNumber = 1;
        
        if (pages.length > 0) {
            spreads.push({
                id: `spread-${spreadNumber}`,
                spreadNumber: spreadNumber++,
                leftPage: null,
                rightPage: pages[0]
            });
        }

        for (let i = 1; i < pages.length; i += 2) {
            spreads.push({
                id: `spread-${spreadNumber}`,
                spreadNumber,
                leftPage: pages[i],
                rightPage: i + 1 < pages.length ? pages[i + 1] : null
            });
            spreadNumber++;
        }

        return spreads;
    }
}
