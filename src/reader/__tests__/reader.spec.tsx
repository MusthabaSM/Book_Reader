import React from 'react';
import { renderToString } from 'react-dom/server';
import { readerReducer } from '../state';
import { PageElementRenderer } from '../../components/reader/PageElementRenderer';
import type { TextElement, ImageElement, CodeElement } from '../../pagination/page-model';
import { BookReader } from '../../components/reader/BookReader';
import { defaultPaginationConfig } from '../../pagination/layout/config';
import type { Book, ParagraphBlock } from '../../book/models';
import { Paginator } from '../../pagination/paginator';
import { MockTextMeasurer } from '../../pagination/layout/measurer';

function runTests() {
    console.log('Running reader UI tests...');
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    // 1. Reader State Navigation (Instant)
    let state = readerReducer({ spreads: [], totalSpreads: 5, currentSpreadIndex: 0, zoomLevel: 1.0, isTurning: false, turnDirection: null, nextSpreadIndex: null, turnId: 0, searchQuery: '', searchResults: [], currentSearchMatchIndex: -1, isSearchVisible: false, isSearching: false }, { type: 'NEXT_SPREAD' });
    assert(state.currentSpreadIndex === 1, 'Next navigation');

    state = readerReducer(state, { type: 'PREV_SPREAD' });
    assert(state.currentSpreadIndex === 0, 'Previous navigation');

    state = readerReducer(state, { type: 'LAST_SPREAD' });
    assert(state.currentSpreadIndex === 4, 'Last navigation');

    state = readerReducer(state, { type: 'FIRST_SPREAD' });
    assert(state.currentSpreadIndex === 0, 'First navigation');

    // 2. Reader State Animation (Turn)
    state = readerReducer(state, { type: 'START_TURN', direction: 'forward' });
    const turnId1 = state.turnId;
    assert(state.isTurning === true && state.nextSpreadIndex === 1 && state.currentSpreadIndex === 0, 'Start turn locks state and calculates target');

    state = readerReducer(state, { type: 'START_TURN', direction: 'forward' }); // Attempt while locked
    assert(state.turnId === turnId1, 'Input locked during animation');

    state = readerReducer(state, { type: 'NEXT_SPREAD' });
    assert(state.currentSpreadIndex === 0, 'Instant navigation locked during animation');

    state = readerReducer(state, { type: 'COMMIT_TURN', turnId: turnId1 });
    assert(state.currentSpreadIndex === 1 && state.isTurning === false && state.nextSpreadIndex === null, 'Commit turn updates logical spread');

    state = readerReducer(state, { type: 'START_TURN', direction: 'backward' });
    const turnId2 = state.turnId;
    state = readerReducer(state, { type: 'CANCEL_TURN' });
    assert(state.currentSpreadIndex === 1 && state.isTurning === false, 'Cancel turn reverts visual state without modifying logical spread');
    
    // Test: cancelled turn cannot commit
    state = readerReducer(state, { type: 'COMMIT_TURN', turnId: turnId2 });
    assert(state.currentSpreadIndex === 1 && state.isTurning === false, 'Cancelled turn commits zero times');

    // Test: stale commit cannot override new turn
    state = readerReducer(state, { type: 'START_TURN', direction: 'forward' });
    const turnId3 = state.turnId;
    state = readerReducer(state, { type: 'COMMIT_TURN', turnId: turnId2 }); // Stale commit from cancelled turn 2
    assert(state.isTurning === true && state.currentSpreadIndex === 1, 'Stale commit cannot override new active turn');
    
    state = readerReducer(state, { type: 'COMMIT_TURN', turnId: turnId3 });
    assert(state.currentSpreadIndex === 2, 'Valid commit succeeds');

    // 3. Zoom Boundaries
    state = readerReducer(state, { type: 'ZOOM_OUT' });
    state = readerReducer(state, { type: 'ZOOM_OUT' });
    state = readerReducer(state, { type: 'ZOOM_OUT' });
    assert(state.zoomLevel === 0.5, 'Zoom out boundary (0.5)');

    state = readerReducer(state, { type: 'RESET_ZOOM' });
    assert(state.zoomLevel === 1.0, 'Reset zoom');

    // 3. Rendering a text element
    const textEl: TextElement = {
        id: 't1', type: 'text', text: 'Hello Bold', fontFamily: 'serif', fontSize: 16, bold: true,
        geometry: { x: 10, y: 10, width: 100, height: 20 }
    };
    const html1 = renderToString(React.createElement(PageElementRenderer, { element: textEl }));
    assert(html1.includes('Hello Bold') && html1.includes('font-weight:bold'), 'Rendering a text element');

    // 4. Rendering a code block
    const codeEl: CodeElement = {
        id: 'c1', type: 'code', codeLines: ['const x = 1;'], fontFamily: 'mono', fontSize: 14,
        geometry: { x: 10, y: 10, width: 100, height: 20 }
    };
    const html2 = renderToString(React.createElement(PageElementRenderer, { element: codeEl }));
    assert(html2.includes('const x = 1;') && html2.includes('<pre'), 'Rendering a code block');

    // 5. Rendering an image reference
    const imgEl: ImageElement = {
        id: 'i1', type: 'image', resourceId: 'res-img-1',
        geometry: { x: 10, y: 10, width: 100, height: 100 }
    };
    const html3 = renderToString(React.createElement(PageElementRenderer, { element: imgEl }));
    assert(html3.includes('Image Placeholder:') && html3.includes('res-img-1'), 'Rendering an image reference placeholder');

    // 6. Unsupported element placeholder
    const unknownEl = {
        id: 'u1', type: 'unknown',
        geometry: { x: 10, y: 10, width: 100, height: 100 }
    } as any;
    const html4 = renderToString(React.createElement(PageElementRenderer, { element: unknownEl }));
    assert(html4.includes('[Unsupported Element:') && html4.includes('unknown'), 'Unsupported element placeholder');

    // 7. Full BookReader mounting with odd/empty spreads (Sample Book flow)
    const mockBook: Book = {
        type: 'reflowable',
        id: 'mock-book-1',
        metadata: { 
            title: { value: 'Sample Book', provenance: 'file-extracted' }, 
            authors: { value: [{ id: 'a1', displayName: 'Author' }], provenance: 'file-extracted' },
            genres: { value: [], provenance: 'file-extracted' },
            originalFilename: 'test.txt',
            sourceFormat: 'txt',
            fileSizeBytes: 100
        },
        resources: {},
        chapters: [{
            id: 'c1',
            blocks: [
                { id: 'p1', type: 'paragraph', runs: [{ text: 'This is a test book.' }] } as ParagraphBlock,
                { id: 'p2', type: 'paragraph', runs: [{ text: 'It has multiple paragraphs.' }] } as ParagraphBlock
            ]
        }]
    };
    const paginator = new Paginator();
    const paginationResult = paginator.paginate(mockBook, defaultPaginationConfig, new MockTextMeasurer());
    
    assert(paginationResult.spreads.length === 1, 'Sample book generates 1 spread');

    const htmlReader = renderToString(React.createElement(BookReader, { paginationResult, onClose: () => {}, bookTitle: 'Sample Book', singlePageMode: false, onToggleSinglePage: () => {}, onRotate: () => {} }));
    assert(htmlReader.includes('1') && htmlReader.includes('1'), 'BookReader mounts and renders toolbar');
    assert(htmlReader.includes('This ') && htmlReader.includes('test '), 'BookReader renders text element');
    assert(htmlReader.includes('background-color:#f0f0f0'), 'Odd page count renders empty side (placeholder)');

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) throw new Error('Reader UI tests failed');
}

runTests();
