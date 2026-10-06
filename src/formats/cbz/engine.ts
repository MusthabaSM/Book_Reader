import JSZip from 'jszip';
import type { DocumentSource } from '../../library/repository';

export interface CbzPageHandle {
    index: number;
    renderToBlobUrl(): Promise<string>;
}

export class CbzDocumentHandle {
    private zip: JSZip;
    private pageEntries: string[];
    private urlCache: Map<number, string> = new Map();
    
    constructor(zip: JSZip, pageEntries: string[]) {
        this.zip = zip;
        this.pageEntries = pageEntries;
    }

    public getPageCount(): number {
        return this.pageEntries.length;
    }

    public getCachedUrl(index: number): string | null {
        return this.urlCache.get(index) || null;
    }

    public async getPage(index: number): Promise<CbzPageHandle> {
        if (index < 0 || index >= this.pageEntries.length) {
            throw new Error(`Page index ${index} out of bounds`);
        }
        
        return {
            index,
            renderToBlobUrl: async () => {
                if (this.urlCache.has(index)) {
                    return this.urlCache.get(index)!;
                }

                const entryName = this.pageEntries[index];
                const entry = this.zip.files[entryName];
                const bytes = await entry.async('uint8array');
                
                const ext = entryName.split('.').pop()?.toLowerCase();
                const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                
                const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
                const url = URL.createObjectURL(blob);
                this.urlCache.set(index, url);
                return url;
            }
        };
    }

    public releaseBlobUrl(url: string) {
        // Find if it's in the cache and remove it
        for (const [idx, cachedUrl] of this.urlCache.entries()) {
            if (cachedUrl === url) {
                URL.revokeObjectURL(url);
                this.urlCache.delete(idx);
                break;
            }
        }
    }

    public async destroy() {
        this.urlCache.forEach(url => URL.revokeObjectURL(url));
        this.urlCache.clear();
        (this as any).zip = null;
        (this as any).pageEntries = null;
    }
}

export class CompositeCbzDocumentHandle {
    private handles: CbzDocumentHandle[];
    private pageOffsets: number[];

    constructor(handles: CbzDocumentHandle[]) {
        this.handles = handles;
        this.pageOffsets = [];
        let currentOffset = 0;
        for (const h of handles) {
            this.pageOffsets.push(currentOffset);
            currentOffset += h.getPageCount();
        }
    }

    public getPageCount(): number {
        if (this.pageOffsets.length === 0) return 0;
        const lastIndex = this.pageOffsets.length - 1;
        return this.pageOffsets[lastIndex] + this.handles[lastIndex].getPageCount();
    }

    public getCachedUrl(index: number): string | null {
        const { handle, localIndex } = this.resolveHandle(index);
        return handle.getCachedUrl(localIndex);
    }

    public async getPage(index: number): Promise<CbzPageHandle> {
        const { handle, localIndex } = this.resolveHandle(index);
        const pageHandle = await handle.getPage(localIndex);
        
        return {
            index, // Return the global index
            renderToBlobUrl: pageHandle.renderToBlobUrl
        };
    }

    public releaseBlobUrl(url: string) {
        for (const h of this.handles) {
            h.releaseBlobUrl(url);
        }
    }

    public async destroy() {
        for (const h of this.handles) {
            await h.destroy();
        }
        (this as any).handles = null;
        (this as any).pageOffsets = null;
    }

    private resolveHandle(globalIndex: number): { handle: CbzDocumentHandle, localIndex: number } {
        if (globalIndex < 0) throw new Error(`Page index ${globalIndex} out of bounds`);
        
        let handleIndex = 0;
        for (let i = 0; i < this.pageOffsets.length; i++) {
            if (globalIndex >= this.pageOffsets[i]) {
                handleIndex = i;
            } else {
                break;
            }
        }
        
        const localIndex = globalIndex - this.pageOffsets[handleIndex];
        return { handle: this.handles[handleIndex], localIndex };
    }
}

export class CbzEngine {
    static async loadDocument(source: DocumentSource | DocumentSource[]): Promise<CbzDocumentHandle | CompositeCbzDocumentHandle> {
        if (Array.isArray(source)) {
            if (source.length === 0) throw new Error('No sources provided');
            if (source.length === 1) return this.loadSingleDocument(source[0]);
            
            const handles = await Promise.all(source.map(s => this.loadSingleDocument(s)));
            return new CompositeCbzDocumentHandle(handles);
        }
        return this.loadSingleDocument(source);
    }

    private static async loadSingleDocument(source: DocumentSource): Promise<CbzDocumentHandle> {
        const response = await fetch(source.url);
        if (!response.ok) {
            throw new Error(`Failed to fetch CBZ document from ${source.url}`);
        }
        const buffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(new Uint8Array(buffer));
        
        const validExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
        const entries = Object.keys(zip.files)
            .filter(filename => !zip.files[filename].dir) 
            .filter(filename => !filename.startsWith('__MACOSX/')) 
            .filter(filename => !filename.split('/').pop()?.startsWith('.')) 
            .filter(filename => validExtensions.test(filename));
            
        entries.sort((a, b) => {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        if (entries.length === 0) {
            throw new Error('INVALID_CBZ_NO_PAGES');
        }

        return new CbzDocumentHandle(zip, entries);
    }
}
