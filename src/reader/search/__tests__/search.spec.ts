import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../index';
import type { PdfDocumentHandle, NormalizedTextContent } from '../../../formats/pdf/engine';

describe('SearchService - PDF Search', () => {
    it('finds a single word match inside a text item', async () => {
        const textContent: NormalizedTextContent = {
            items: [
                { text: 'Hello beautiful world', x: 0, y: 0, width: 100, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] }
            ]
        };
        
        const mockPdfHandle = createMockPdfHandle([textContent]);
        const service = new SearchService();
        
        const results = await service.search('beautiful', { type: 'fixed' } as any, mockPdfHandle);
        
        expect(results.length).toBe(1);
        expect(results[0].pageOrChapterIndex).toBe(0);
        expect(results[0].pdfMatchRects).toBeDefined();
        expect(results[0].pdfMatchRects!.length).toBe(1);
        
        const rect = results[0].pdfMatchRects![0];
        expect(rect.itemIndex).toBe(0);
        expect(rect.textOffset).toBe(6);
        expect(rect.textLength).toBe('beautiful'.length);
    });

    it('finds phrases spanning multiple text items and correctly maps the rectangles', async () => {
        const textContent: NormalizedTextContent = {
            items: [
                { text: 'Hello ', x: 0, y: 0, width: 30, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] },
                { text: 'world', x: 30, y: 0, width: 25, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,30,0] }
            ]
        };
        
        const mockPdfHandle = createMockPdfHandle([textContent]);
        const service = new SearchService();
        
        const results = await service.search('hello world', { type: 'fixed' } as any, mockPdfHandle);
        
        expect(results.length).toBe(1);
        expect(results[0].pdfMatchRects!.length).toBe(2);
        
        const [rect1, rect2] = results[0].pdfMatchRects!;
        
        expect(rect1.itemIndex).toBe(0);
        expect(rect1.textOffset).toBe(0);
        expect(rect1.textLength).toBe(6); // 'Hello '
        
        expect(rect2.itemIndex).toBe(1);
        expect(rect2.textOffset).toBe(0);
        expect(rect2.textLength).toBe(5); // 'world'
    });

    it('adds appropriate whitespace between items lacking natural spaces but separated by geometry', async () => {
        const textContent: NormalizedTextContent = {
            items: [
                // No trailing space, but gap > 0.25 * height
                { text: 'Hello', x: 0, y: 0, width: 30, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] },
                { text: 'world', x: 35, y: 0, width: 25, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,35,0] }
            ]
        };
        
        const mockPdfHandle = createMockPdfHandle([textContent]);
        const service = new SearchService();
        
        const results = await service.search('hello world', { type: 'fixed' } as any, mockPdfHandle);
        
        expect(results.length).toBe(1);
        expect(results[0].pdfMatchRects!.length).toBe(2);
        
        const [rect1, rect2] = results[0].pdfMatchRects!;
        
        expect(rect1.itemIndex).toBe(0);
        expect(rect1.textOffset).toBe(0);
        expect(rect1.textLength).toBe(5); // 'Hello'
        
        expect(rect2.itemIndex).toBe(1);
        expect(rect2.textOffset).toBe(0);
        expect(rect2.textLength).toBe(5); // 'world'
    });

    it('matches multiple occurrences correctly', async () => {
        const textContent: NormalizedTextContent = {
            items: [
                { text: 'book book book', x: 0, y: 0, width: 100, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] }
            ]
        };
        
        const mockPdfHandle = createMockPdfHandle([textContent]);
        const service = new SearchService();
        
        const results = await service.search('book', { type: 'fixed' } as any, mockPdfHandle);
        
        expect(results.length).toBe(3);
        
        expect(results[0].pdfMatchRects![0].textOffset).toBe(0);
        expect(results[1].pdfMatchRects![0].textOffset).toBe(5);
        expect(results[2].pdfMatchRects![0].textOffset).toBe(10);
    });
    
    it('matches across multiple pages', async () => {
        const page1: NormalizedTextContent = {
            items: [{ text: 'Find me', x: 0, y: 0, width: 50, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] }]
        };
        const page2: NormalizedTextContent = {
            items: [{ text: 'Find me too', x: 0, y: 0, width: 50, height: 10, dir: 'ltr', hasEOL: false, fontName: 'Arial', transform: [1,0,0,1,0,0] }]
        };
        
        const mockPdfHandle = createMockPdfHandle([page1, page2]);
        const service = new SearchService();
        
        const results = await service.search('find me', { type: 'fixed' } as any, mockPdfHandle);
        
        expect(results.length).toBe(2);
        expect(results[0].pageOrChapterIndex).toBe(0);
        expect(results[1].pageOrChapterIndex).toBe(1);
    });
});

function createMockPdfHandle(pages: NormalizedTextContent[]): PdfDocumentHandle {
    return {
        getPageCount: () => pages.length,
        getPage: async (i: number) => ({
            pageIndex: i,
            pageNumber: i + 1,
            width: 800,
            height: 1000,
            render: vi.fn(),
            getTextContent: async () => pages[i],
            getHighlightRects: async () => [],
            getViewport: () => ({ width: 800, height: 1000, convertToViewportPoint: vi.fn() })
        } as any),
        getMetadata: async () => ({ title: 'Test PDF', pageCount: pages.length }),
        destroy: vi.fn()
    };
}
