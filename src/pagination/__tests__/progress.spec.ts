import { test, expect } from 'vitest';
import { calculateReadingProgress } from '../progress';
import type { FixedDocument } from '../../book/models/fixed';

test('calculateReadingProgress', () => {
    const doc: FixedDocument = {
        type: 'fixed',
        id: 'test-doc',
        documentSourceId: 'opaque-123',
        metadata: {
            title: { value: 'Test', provenance: 'filename-inferred' },
            authors: { value: [], provenance: 'filename-inferred' },
            genres: { value: [], provenance: 'filename-inferred' },
            originalFilename: 'test.pdf',
            sourceFormat: 'pdf',
            fileSizeBytes: 100
        },
        pageCount: 5,
        pages: [
            { pageIndex: 0, width: 100, height: 200, rotation: 0 },
            { pageIndex: 1, width: 100, height: 200, rotation: 0 },
            { pageIndex: 2, width: 100, height: 200, rotation: 0 },
            { pageIndex: 3, width: 100, height: 200, rotation: 0 },
            { pageIndex: 4, width: 100, height: 200, rotation: 0 }
        ],
        resources: {}
    };

    const firstPageProgress = calculateReadingProgress({ type: 'fixed', bookId: 'test-doc', pageIndex: 0 }, doc);
    expect(firstPageProgress).toBe(0);

    const middlePageProgress = calculateReadingProgress({ type: 'fixed', bookId: 'test-doc', pageIndex: 2 }, doc);
    expect(middlePageProgress).toBe(50);

    const finalPageProgress = calculateReadingProgress({ type: 'fixed', bookId: 'test-doc', pageIndex: 4 }, doc);
    expect(finalPageProgress).toBe(100);
});
