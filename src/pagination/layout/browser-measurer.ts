import type { TextMeasurer, TextMetrics } from './measurer';

export class BrowserTextMeasurer implements TextMeasurer {
    private canvas: HTMLCanvasElement | null = null;
    private context: CanvasRenderingContext2D | null = null;
    private cache = new Map<string, TextMetrics>();
    private maxCacheSize = 5000;

    private getContext(): CanvasRenderingContext2D {
        if (!this.context) {
            if (typeof document === 'undefined') {
                throw new Error('BrowserTextMeasurer requires a DOM environment. Use MockTextMeasurer for non-DOM tests.');
            }
            this.canvas = document.createElement('canvas');
            this.context = this.canvas.getContext('2d');
            if (!this.context) throw new Error('Failed to obtain CanvasRenderingContext2D');
        }
        return this.context;
    }

    public measureText(text: string, fontFamily: string, fontSize: number, bold?: boolean, italic?: boolean): TextMetrics {
        const fontString = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
        const cacheKey = `${fontString}::${text}`;

        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const ctx = this.getContext();
        ctx.font = fontString;
        const metrics = ctx.measureText(text);

        let height = fontSize * 1.2; // Fallback
        if (metrics.actualBoundingBoxAscent !== undefined && metrics.actualBoundingBoxDescent !== undefined) {
            height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
            // Prevent 0 height for empty strings or whitespace
            if (height === 0) height = fontSize * 1.2;
        }

        const result: TextMetrics = {
            width: metrics.width,
            height
        };

        if (this.cache.size >= this.maxCacheSize) {
            // Very simple LRU-ish cache clearing when full
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(cacheKey, result);
        return result;
    }
}
