import { FixedPresentationEngine } from '../engine';
import type { FixedDocument } from '../../../book/models/fixed';
import { test, expect } from 'vitest';

test('FixedPresentationEngine maps pages to spreads correctly', () => {
    const doc: FixedDocument = {
        type: 'fixed',
        id: 'test-doc',
        documentSourceId: 'opaque-binary-123',
        metadata: {
            title: { value: 'Test', provenance: 'filename-inferred' },
            authors: { value: [], provenance: 'filename-inferred' },
            genres: { value: [], provenance: 'filename-inferred' },
            originalFilename: 'test.pdf',
            sourceFormat: 'pdf',
            fileSizeBytes: 100
        },
        pageCount: 3,
        pages: [
            { pageIndex: 0, width: 100, height: 200, rotation: 0 },
            { pageIndex: 1, width: 100, height: 200, rotation: 90 },
            { pageIndex: 2, width: 100, height: 200, rotation: 0 }
        ],
        resources: {}
    };

    const engine = new FixedPresentationEngine();
    const spreads = engine.paginate(doc, { pageWidth: 800, pageHeight: 1200, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, fontFamily: 'serif', baseFontSize: 16, lineHeight: 1.5, paragraphSpacing: 16, headingSpacing: 24, textAlign: 'left' });

    expect(spreads.length).toBe(2);

    // Spread 0
    expect(spreads[0].leftPage).toBeDefined();
    expect(spreads[0].leftPage!.type).toBe('fixed');
    expect((spreads[0].leftPage as any).pageIndex).toBe(0);
    expect((spreads[0].leftPage as any).documentSourceId).toBe('opaque-binary-123');
    expect((spreads[0].leftPage as any).width).toBe(100);

    expect(spreads[0].rightPage).toBeDefined();
    expect((spreads[0].rightPage as any).pageIndex).toBe(1);
    expect((spreads[0].rightPage as any).rotation).toBe(90);

    // Spread 1 (odd final page)
    expect(spreads[1].leftPage).toBeDefined();
    expect((spreads[1].leftPage as any).pageIndex).toBe(2);
    
    expect(spreads[1].rightPage).toBeNull();
});
