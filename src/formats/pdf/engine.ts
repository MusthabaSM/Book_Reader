import type { DocumentSource } from '../../library/repository';

export interface NormalizedTextContent {
    items: { text: string; x: number; y: number; width: number; height: number; dir: string; hasEOL: boolean; fontName: string; transform: number[] }[];
}

export interface PdfPageHandle {
    pageIndex: number;
    pageNumber: number;
    width: number;
    height: number;
    rotation: number;
    
    render(canvas: HTMLCanvasElement, scale?: number, rotation?: number): Promise<void>;
    getTextContent(): Promise<NormalizedTextContent>;
    getHighlightRects(matchRects: { itemIndex: number, textOffset: number, textLength: number }[], scale: number): Promise<{x: number, y: number, width: number, height: number}[]>;
}

export interface PdfDocumentHandle {
    getPageCount(): number;
    getPage(index: number): Promise<PdfPageHandle>;
    getMetadata(): Promise<{ title?: string; author?: string }>;
    destroy(): Promise<void>;
}

export class PdfEngine {
    static async loadDocument(source: DocumentSource): Promise<PdfDocumentHandle> {
        // Lazily load pdfjs-dist so it doesn't crash test environments or bloat the initial bundle
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            if (typeof global !== 'undefined' && !(global as any).DOMMatrix) {
                (global as any).DOMMatrix = class DOMMatrix {};
            }
        }
        const pdfjsLib = await import('pdfjs-dist');
        
        if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
        }

        const initParams: any = {
            url: source.url,
            wasmUrl: '/wasm/',
            // We use defaults for disableStream, disableAutoFetch, disableRange
            // for Stage 3, as the browser blob URL correctly supports range implicitly,
            // and we want to prove normal behaviour.
        };

        // If running in Node/Vitest, standard fonts may need to be resolved from node_modules manually
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            initParams.standardFontDataUrl = 'node_modules/pdfjs-dist/standard_fonts/';
        }

        console.log('[PDF.js] wasmUrl:', initParams.wasmUrl);
        console.log('[PDF.js] pdfjs version:', pdfjsLib.version);

        const loadingTask = pdfjsLib.getDocument(initParams);

        const pdfDoc = await loadingTask.promise;

        return new PdfDocumentHandleImpl(pdfDoc, loadingTask);
    }

    static async diagnoseLoading(source: DocumentSource, originalBytes: Uint8Array): Promise<any> {
        // Lazily load pdfjs-dist
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            if (typeof global !== 'undefined' && !(global as any).DOMMatrix) {
                (global as any).DOMMatrix = class DOMMatrix {};
            }
        }
        const pdfjsLib = await import('pdfjs-dist');
        
        if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
        }

        const diagnostics: any = {
            dataLoadSucceeded: false,
            urlLoadSucceeded: false,
            dataError: null,
            urlError: null,
            dataErrorConstructor: null,
            urlErrorConstructor: null
        };

        const standardFontDataUrl = (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') 
            ? 'node_modules/pdfjs-dist/standard_fonts/' : undefined;

        // Test 1: Load from original bytes
        try {
            const taskData = pdfjsLib.getDocument({ data: originalBytes, standardFontDataUrl, wasmUrl: '/wasm/' });
            await taskData.promise;
            diagnostics.dataLoadSucceeded = true;
            await taskData.destroy();
        } catch (e: any) {
            diagnostics.dataError = { name: e.name, message: e.message };
            diagnostics.dataErrorConstructor = e.constructor?.name;
        }

        // Test 2: Load from URL
        try {
            const taskUrl = pdfjsLib.getDocument({ url: source.url, standardFontDataUrl, wasmUrl: '/wasm/' });
            await taskUrl.promise;
            diagnostics.urlLoadSucceeded = true;
            await taskUrl.destroy();
        } catch (e: any) {
            diagnostics.urlError = { name: e.name, message: e.message };
            diagnostics.urlErrorConstructor = e.constructor?.name;
        }

        return diagnostics;
    }
}

class PdfPageHandleImpl implements PdfPageHandle {
    public readonly pageIndex: number;
    public readonly pageNumber: number;
    public readonly width: number;
    public readonly height: number;
    public readonly rotation: number;

    private pdfPage: any; // PDFPageProxy

    constructor(pdfPage: any, pageIndex: number) {
        this.pdfPage = pdfPage;
        this.pageIndex = pageIndex;
        this.pageNumber = pageIndex + 1;

        // Viewport at scale 1 gives us base dimensions
        const viewport = pdfPage.getViewport({ scale: 1.0 });
        this.width = viewport.width;
        this.height = viewport.height;
        this.rotation = viewport.rotation;
    }

    public async render(canvas: HTMLCanvasElement, scale: number = 1.0, userRotation: number = 0): Promise<void> {
        const viewport = this.pdfPage.getViewport({ scale, rotation: this.rotation + userRotation });
        
        // Handle devicePixelRatio for sharp rendering on high-DPI displays
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        
        // Set CSS dimensions to base size (scale = 1.0) 
        // because ReaderViewport already handles visual CSS scaling via transform.
        const baseViewport = this.pdfPage.getViewport({ scale: 1.0, rotation: this.rotation + userRotation });
        canvas.style.width = Math.floor(baseViewport.width) + "px";
        canvas.style.height =  Math.floor(baseViewport.height) + "px";

        const transform = outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : null;

        const renderContext = {
            canvasContext: canvas.getContext('2d')!,
            transform: transform,
            viewport: viewport
        };

        const renderTask = this.pdfPage.render(renderContext);
        await renderTask.promise;
    }

    public async getTextContent(): Promise<NormalizedTextContent> {
        const textContent = await this.pdfPage.getTextContent();
        
        const items = textContent.items.map((item: any) => {
            // item.transform is an array [scaleX, skewY, skewX, scaleY, translateX, translateY]
            return {
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height,
                dir: item.dir,
                hasEOL: item.hasEOL || false,
                fontName: item.fontName || '',
                transform: item.transform
            };
        });

        return { items };
    }

    public async getHighlightRects(matchRects: { itemIndex: number, textOffset: number, textLength: number }[], scale: number): Promise<{x: number, y: number, width: number, height: number}[]> {
        const textContent = await this.pdfPage.getTextContent();
        const viewport = this.pdfPage.getViewport({ scale });
        
        const rects = [];
        for (const matchRect of matchRects) {
            const idx = matchRect.itemIndex;
            if (idx >= 0 && idx < textContent.items.length) {
                const item = textContent.items[idx] as any;
                
                const textStr = item.str || '';
                const totalChars = Math.max(1, textStr.length);
                
                const tx = item.transform[4];
                const ty = item.transform[5];
                
                // fontHeight is derived from the scaleY of the transform
                const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height;
                
                // baseline direction
                const dirX = item.transform[0];
                const dirY = item.transform[1];
                const scaleX = Math.hypot(dirX, dirY);
                const normX = scaleX > 0 ? dirX / scaleX : 1;
                const normY = scaleX > 0 ? dirY / scaleX : 0;
                
                // FALLBACK APPROXIMATION:
                // Since PDF.js getTextContent() does not provide exact per-glyph metrics,
                // we approximate the partial match position by interpolating along the total width.
                // This is the most accurate fallback available without manually measuring fonts.
                const startOffset = (matchRect.textOffset / totalChars) * item.width;
                const endOffset = ((matchRect.textOffset + matchRect.textLength) / totalChars) * item.width;
                
                // Point 1: Baseline start
                const p1x = tx + startOffset * normX;
                const p1y = ty + startOffset * normY;
                
                // Point 2: Baseline end
                const p2x = tx + endOffset * normX;
                const p2y = ty + endOffset * normY;
                
                // PDF space: +Y goes up. The top of the text is perpendicular to the baseline.
                // Perpendicular vector to (normX, normY) is (-normY, normX)
                const perpX = -normY;
                const perpY = normX;
                
                // Point 3: Top start
                const p3x = p1x + perpX * fontHeight;
                const p3y = p1y + perpY * fontHeight;
                
                // Point 4: Top end
                const p4x = p2x + perpX * fontHeight;
                const p4y = p2y + perpY * fontHeight;
                
                // Convert all 4 points to viewport CSS coordinates
                // convertToViewportPoint handles page scale and rotation automatically!
                const vp1 = viewport.convertToViewportPoint(p1x, p1y);
                const vp2 = viewport.convertToViewportPoint(p2x, p2y);
                const vp3 = viewport.convertToViewportPoint(p3x, p3y);
                const vp4 = viewport.convertToViewportPoint(p4x, p4y);
                
                const minX = Math.min(vp1[0], vp2[0], vp3[0], vp4[0]);
                const maxX = Math.max(vp1[0], vp2[0], vp3[0], vp4[0]);
                const minY = Math.min(vp1[1], vp2[1], vp3[1], vp4[1]);
                const maxY = Math.max(vp1[1], vp2[1], vp3[1], vp4[1]);
                
                rects.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY
                });
            }
        }
        return rects;
    }
}

class PdfDocumentHandleImpl implements PdfDocumentHandle {
    private pdfDoc: any; // PDFDocumentProxy
    private loadingTask: any; // PDFDocumentLoadingTask

    constructor(pdfDoc: any, loadingTask: any) {
        this.pdfDoc = pdfDoc;
        this.loadingTask = loadingTask;
    }

    public getPageCount(): number {
        return this.pdfDoc.numPages;
    }

    public async getPage(index: number): Promise<PdfPageHandle> {
        if (index < 0 || index >= this.getPageCount()) {
            throw new Error(`PAGE_OUT_OF_BOUNDS: Page index ${index} is invalid.`);
        }
        // PDF.js uses 1-based page numbers
        const page = await this.pdfDoc.getPage(index + 1);
        return new PdfPageHandleImpl(page, index);
    }

    public async getMetadata(): Promise<{ title?: string; author?: string }> {
        try {
            const meta = await this.pdfDoc.getMetadata();
            return {
                title: meta?.info?.Title,
                author: meta?.info?.Author
            };
        } catch (e) {
            return {};
        }
    }

    public async destroy(): Promise<void> {
        // Destroy the loading task which cleans up the PDFDocumentProxy and web workers
        await this.loadingTask.destroy();
    }
}
