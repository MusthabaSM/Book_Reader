import type { FixedDocument, FixedDocumentPage } from '../../book/models/fixed';
import type { FixedPresentationPage, Spread } from '../page-model';

import type { PaginationConfig } from '../layout/config';

export class FixedPresentationEngine {
    /**
     * Maps a FixedDocument into an array of Spreads containing FixedPresentationPages.
     * If config.forceSinglePage is true, maps 1 page per spread (as rightPage).
     * Else: page 0 -> left, page 1 -> right, etc.
     */
    public paginate(document: FixedDocument, config: PaginationConfig): Spread[] {
        const spreads: Spread[] = [];
        const pages = document.pages;

        if (config.forceSinglePage) {
            for (let i = 0; i < pages.length; i++) {
                const rightPage: FixedPresentationPage = this.mapPage(pages[i], document.documentSourceId, config, document.metadata?.sourceFormat);
                spreads.push({
                    id: `spread-${i}`,
                    spreadNumber: i,
                    leftPage: null,
                    rightPage
                });
            }
            return spreads;
        }

        let spreadIndex = 0;
        for (let i = 0; i < pages.length; i += 2) {
            const leftDocPage = pages[i];
            const rightDocPage = i + 1 < pages.length ? pages[i + 1] : null;

            const leftPage: FixedPresentationPage = this.mapPage(leftDocPage, document.documentSourceId, config, document.metadata?.sourceFormat);
            const rightPage: FixedPresentationPage | null = rightDocPage ? this.mapPage(rightDocPage, document.documentSourceId, config, document.metadata?.sourceFormat) : null;

            spreads.push({
                id: `spread-${spreadIndex}`,
                spreadNumber: spreadIndex,
                leftPage,
                rightPage
            });

            spreadIndex++;
        }

        return spreads;
    }

    private mapPage(docPage: FixedDocumentPage, documentSourceId: string, config: PaginationConfig, format?: string): FixedPresentationPage {
        const userRotation = config.rotation || 0;
        const totalRotation = (docPage.rotation || 0) + userRotation;
        const isRotated = userRotation % 180 !== 0;

        return {
            type: 'fixed',
            id: `fixed-${documentSourceId}-${docPage.pageIndex}`,
            pageNumber: docPage.pageIndex + 1, // Logical 1-indexed for UI display if needed
            pageIndex: docPage.pageIndex,
            documentSourceId,
            width: isRotated ? docPage.height : docPage.width,
            height: isRotated ? docPage.width : docPage.height,
            rotation: totalRotation,
            format
        };
    }
}
