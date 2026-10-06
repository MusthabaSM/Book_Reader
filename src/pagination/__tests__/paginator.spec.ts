import { defaultPaginationConfig } from '../layout/config';
import { MockTextMeasurer } from '../layout/measurer';
import { BrowserTextMeasurer } from '../layout/browser-measurer';
import { Paginator } from '../paginator';
import { TxtImporter } from '../../formats/importers/txt';
import { MockFileDataSource } from '../../formats/__tests__/mock-data-source';
import type { FileInput } from '../../formats/models';
import type { Book, ParagraphBlock, PageBreakBlock, ImageBlock } from '../../book/models';

async function runTests() {
    console.log('Running pagination tests...');
    
    let failed = 0;
    let passed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    const paginator = new Paginator();
    const measurer = new MockTextMeasurer();

    // 1. Empty book
    const emptyBook: Book = { type: 'reflowable', id: 'b1', metadata: {} as any, chapters: [], resources: {} };
    const res1 = paginator.paginate(emptyBook, defaultPaginationConfig, measurer);
    assert(res1.pageCount === 1, 'Empty book generates at least 1 page');

    // 2. Single paragraph
    const singleParaBook: Book = {
        type: 'reflowable',
        id: 'b2',
        metadata: {} as any,
        resources: {},
        chapters: [{
            id: 'c1',
            blocks: [{
                id: 'p1',
                type: 'paragraph',
                runs: [{ text: 'Hello World' }]
            } as ParagraphBlock]
        }]
    };
    const res2 = paginator.paginate(singleParaBook, defaultPaginationConfig, measurer);
    assert(res2.pageCount === 1, 'Single paragraph fits on 1 page');
    assert(res2.pages[0].elements.length === 2, 'Paragraph elements generated (Hello, World)');

    // 4. Long paragraph spanning multiple pages
    const lotsOfText = Array(500).fill('LongWord').join(' ');
    const longParaBook: Book = {
        type: 'reflowable',
        id: 'b3',
        metadata: {} as any,
        resources: {},
        chapters: [{
            id: 'c1',
            blocks: [{
                id: 'p1',
                type: 'paragraph',
                runs: [{ text: lotsOfText }]
            } as ParagraphBlock]
        }]
    };
    const res3 = paginator.paginate(longParaBook, defaultPaginationConfig, measurer);
    assert(res3.pageCount > 1, 'Long paragraph spans multiple pages');

    // 6. Explicit page break
    const pbBook: Book = {
        type: 'reflowable',
        id: 'b4',
        metadata: {} as any,
        resources: {},
        chapters: [{
            id: 'c1',
            blocks: [
                { id: 'p1', type: 'paragraph', runs: [{ text: 'Page 1' }] } as ParagraphBlock,
                { id: 'pb1', type: 'page-break' } as PageBreakBlock,
                { id: 'p2', type: 'paragraph', runs: [{ text: 'Page 2' }] } as ParagraphBlock
            ]
        }]
    };
    const res4 = paginator.paginate(pbBook, defaultPaginationConfig, measurer);
    assert(res4.pageCount === 2, 'Explicit page break');

    // 8. Image block
    const imgBook: Book = {
        type: 'reflowable',
        id: 'b5',
        metadata: {} as any,
        resources: { 'res1': { id: 'res1', type: 'image', mimeType: 'image/png', url: '' } },
        chapters: [{
            id: 'c1',
            blocks: [{ id: 'img1', type: 'image', resourceId: 'res1' } as ImageBlock]
        }]
    };
    const res5 = paginator.paginate(imgBook, defaultPaginationConfig, measurer);
    assert(res5.pages[0].elements.find((e: any) => e.type === 'image') !== undefined, 'Image block generates image element');

    // 11/12. Spreads odd/even check
    assert(res2.spreads.length === 1, '1 page -> 1 spread'); // Spread 1: (null, Page 1)
    assert(res4.spreads.length === 2, '2 pages -> 2 spreads'); // Spread 1: (null, Page 1), Spread 2: (Page 2, null)

    // 16. Reading position tracking
    assert(res2.pages[0].startPosition.blockId === 'p1', 'Reading position starts correctly');

    // 22. End to end TXT test
    const txtImporter = new TxtImporter();
    const txtFile: FileInput = { fileName: 'test.txt', extension: '.txt', fileSizeBytes: 100, dataSource: new MockFileDataSource('Line 1\n\nLine 2\n\nLine 3') };
    const importRes = await txtImporter.import(txtFile);
    if (importRes.status === 'success') {
        const e2eRes = paginator.paginate(importRes.document as import('../../book/models').Book, defaultPaginationConfig, measurer);
        assert(e2eRes.pageCount > 0, 'TXT -> Book -> Paginator (End-to-End works)');
    } else {
        assert(false, 'TXT Import failed');
    }

    // 23. BrowserTextMeasurer
    const originalDocument = (globalThis as any).document;
    (globalThis as any).document = {
        createElement: (tag: string) => {
            if (tag === 'canvas') {
                return {
                    getContext: (type: string) => {
                        if (type === '2d') {
                            return {
                                set font(_val: string) {},
                                measureText: (text: string) => ({ 
                                    width: text.length * 10,
                                    actualBoundingBoxAscent: 10,
                                    actualBoundingBoxDescent: 2
                                })
                            };
                        }
                        return null;
                    }
                };
            }
            return null;
        }
    };
    
    try {
        const browserMeasurer = new BrowserTextMeasurer();
        const metrics1 = browserMeasurer.measureText('test', 'serif', 16, true, false);
        assert(metrics1.width === 40 && metrics1.height === 12, 'BrowserTextMeasurer uses Canvas API to measure text');
        
        const metrics2 = browserMeasurer.measureText('test', 'serif', 16, true, false); // hit cache
        assert(metrics2.width === 40, 'BrowserTextMeasurer utilizes internal cache');
    } finally {
        (globalThis as any).document = originalDocument;
    }

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) throw new Error('Pagination tests failed');
}

runTests().catch(e => {
    console.error('Test script failed:', e);
    throw e;
});
