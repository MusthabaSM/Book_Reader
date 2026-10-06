import type { PresentationPage } from '../../pagination/page-model';
import type { PaginationConfig } from '../../pagination/layout/config';

export function getPresentationPageWidth(page: PresentationPage | null, config: PaginationConfig): number {
    if (!page) return config.forceSinglePage ? 0 : config.pageWidth;
    if (page.type === 'fixed') {
        return page.width;
    }
    return config.pageWidth;
}

export function getPresentationPageHeight(page: PresentationPage | null, config: PaginationConfig): number {
    if (!page) return config.forceSinglePage ? 0 : config.pageHeight;
    if (page.type === 'fixed') {
        return page.height;
    }
    return config.pageHeight;
}
