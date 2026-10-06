import type { ReadingPosition, Spread } from './page-model';
import type { DocumentContent } from '../book/models';

/**
 * Calculates reading progress percentage (0-100) based on position and document content.
 */
export function calculateReadingProgress(position: ReadingPosition, document: DocumentContent): number {
    if (position.type === 'fixed') {
        if (document.type !== 'fixed') return 0;
        const totalPages = document.pages.length;
        if (totalPages === 0) return 100;
        if (position.pageIndex <= 0) return 0;
        if (position.pageIndex >= totalPages - 1) return 100;
        
        // Progress derived from pageIndex / pageCount
        return (position.pageIndex / (totalPages - 1)) * 100;
    } else {
        if (document.type !== 'reflowable') return 0;
        
        // Reflowable progress based on chapter index
        let totalChapters = 0;
        let chapterIndex = -1;

        // Simple flat traversal (assumes chapters aren't deeply nested for basic percentage)
        // A robust solution would flatten subChapters and count total blocks.
        const traverse = (chapters: any[]) => {
            for (const ch of chapters) {
                if (ch.id === position.chapterId) {
                    chapterIndex = totalChapters;
                }
                totalChapters++;
                if (ch.subChapters) {
                    traverse(ch.subChapters);
                }
            }
        };

        traverse(document.chapters);

        if (totalChapters === 0) return 100;
        if (chapterIndex === -1) return 0; // Not found

        // Give a rough estimate based on chapter progress. 
        // We aren't doing block-level precision yet since it requires block-counting traversal.
        return (chapterIndex / totalChapters) * 100;
    }
}

/**
 * Resolves a reading position to a spread index within the current pagination.
 */
export function resolveSpreadIndex(position: ReadingPosition | undefined, spreads: Spread[]): number {
    if (!position || spreads.length === 0) return 0;

    for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        
        if (position.type === 'fixed') {
            const leftFixed = spread.leftPage?.type === 'fixed' ? spread.leftPage : null;
            const rightFixed = spread.rightPage?.type === 'fixed' ? spread.rightPage : null;
            if (leftFixed?.pageIndex === position.pageIndex || rightFixed?.pageIndex === position.pageIndex) {
                return i;
            }
        } else {
            // reflowable
            const leftReflowable = spread.leftPage?.type === 'reflowable' ? spread.leftPage : null;
            const rightReflowable = spread.rightPage?.type === 'reflowable' ? spread.rightPage : null;
            
            // Simple match by chapter and block ID. A robust solution checks if it falls between start and end.
            const matches = (page: any) => {
                if (!page) return false;
                // Basic block match
                const hasBlock = page.elements.some((el: any) => el.sourceBlockId === position.blockId);
                if (hasBlock) return true;
                // Basic chapter match if we don't have block granularity
                if (!position.blockId && page.startPosition.chapterId === position.chapterId) return true;
                return false;
            };

            if (matches(leftReflowable) || matches(rightReflowable)) {
                return i;
            }
        }
    }
    
    return 0; // Default to start
}

