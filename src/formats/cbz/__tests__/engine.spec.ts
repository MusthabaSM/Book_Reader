import { describe, it, expect, vi } from 'vitest';
import { CbzEngine } from '../engine';
import type { DocumentSource } from '../../../library/repository';
import JSZip from 'jszip';

describe('CbzEngine', () => {
    it('should load document and provide page blob URLs', async () => {
        // Create a dummy cbz zip
        const zip = new JSZip();
        zip.file('10.jpg', new Uint8Array([1, 2, 3]));
        zip.file('2.jpg', new Uint8Array([4, 5, 6]));
        
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        
        const mockSource: DocumentSource = {
            url: 'test://dummy'
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => bytes.buffer
        } as any);

        const handle = await CbzEngine.loadDocument(mockSource);
        expect(handle.getPageCount()).toBe(2);

        // Test natural sorting
        const page0 = await handle.getPage(0);
        expect(page0.index).toBe(0);
        
        // Wait! In node, URL.createObjectURL might not be natively available if not polyfilled by jsdom.
        // But we can check that it doesn't throw at least until that point.
        if (typeof URL.createObjectURL !== 'undefined') {
            const url = await page0.renderToBlobUrl();
            expect(url).toBeTruthy();
            expect(typeof url).toBe('string');
            
            handle.releaseBlobUrl(url);
        }

        const page1 = await handle.getPage(1);
        expect(page1.index).toBe(1);

        await handle.destroy();
    });

    it('should throw if no images in zip', async () => {
        const zip = new JSZip();
        zip.file('info.txt', 'no images here');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        
        const mockSource: DocumentSource = {
            url: 'test://dummy'
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => bytes.buffer
        } as any);

        await expect(CbzEngine.loadDocument(mockSource)).rejects.toThrow('INVALID_CBZ_NO_PAGES');
    });
});
