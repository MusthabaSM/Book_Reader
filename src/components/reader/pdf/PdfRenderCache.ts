export class PdfRenderCache {
    private static cache = new Map<string, HTMLCanvasElement>();
    private static lru: string[] = [];
    private static maxCacheSize = 6;
    private static inFlightRenders = new Map<string, Promise<HTMLCanvasElement>>();

    public static getCacheKey(documentId: string, pageIndex: number, scale: number): string {
        const dpr = window.devicePixelRatio || 1;
        return `${documentId}_${pageIndex}_${scale}_${dpr}`;
    }

    public static getCached(key: string): HTMLCanvasElement | null {
        if (this.cache.has(key)) {
            // Update LRU
            this.lru = this.lru.filter(k => k !== key);
            this.lru.push(key);
            return this.cache.get(key) || null;
        }
        return null;
    }

    public static async getOrRender(
        key: string,
        renderFn: (canvas: HTMLCanvasElement) => Promise<void>
    ): Promise<HTMLCanvasElement> {
        // 1. Check completed cache
        const cached = this.getCached(key);
        if (cached) {
            return cached;
        }

        // 2. Check in-flight renders
        if (this.inFlightRenders.has(key)) {
            return this.inFlightRenders.get(key)!;
        }

        // 3. Start new render
        const renderPromise = (async () => {
            const canvas = document.createElement('canvas');
            await renderFn(canvas);
            
            // Store in cache upon completion
            this.setCached(key, canvas);
            this.inFlightRenders.delete(key);
            
            return canvas;
        })();

        this.inFlightRenders.set(key, renderPromise);
        
        try {
            return await renderPromise;
        } catch (e) {
            this.inFlightRenders.delete(key);
            throw e;
        }
    }

    private static setCached(key: string, canvas: HTMLCanvasElement) {
        if (this.cache.has(key)) {
            this.lru = this.lru.filter(k => k !== key);
        } else if (this.cache.size >= this.maxCacheSize) {
            // Evict oldest
            const oldestKey = this.lru.shift();
            if (oldestKey) {
                const oldCanvas = this.cache.get(oldestKey);
                if (oldCanvas) {
                    // Help GC by clearing dimensions
                    oldCanvas.width = 0;
                    oldCanvas.height = 0;
                }
                this.cache.delete(oldestKey);
            }
        }
        
        this.cache.set(key, canvas);
        this.lru.push(key);
    }

    public static clearDocument(documentId: string) {
        const prefix = `${documentId}_`;
        for (const key of Array.from(this.cache.keys())) {
            if (key.startsWith(prefix)) {
                const oldCanvas = this.cache.get(key);
                if (oldCanvas) {
                    oldCanvas.width = 0;
                    oldCanvas.height = 0;
                }
                this.cache.delete(key);
                this.lru = this.lru.filter(k => k !== key);
            }
        }
        for (const key of Array.from(this.inFlightRenders.keys())) {
            if (key.startsWith(prefix)) {
                this.inFlightRenders.delete(key);
            }
        }
    }
}
