import type { CoverStorageRepository, CoverArtifact, CoverSource } from './index';

export class BrowserCoverStorageRepository implements CoverStorageRepository {
    private storage = new Map<string, CoverArtifact>();
    private urlCache = new Map<string, string>();

    private isValidId(id: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    public async storeCover(bookId: string, artifact: CoverArtifact): Promise<void> {
        if (!this.isValidId(bookId)) {
            throw new Error(`INVALID_DOCUMENT_ID: Book ID "${bookId}" is malformed or potentially unsafe.`);
        }
        
        if (artifact.data.byteLength === 0) {
            throw new Error('EMPTY_COVER: Cannot store an empty cover.');
        }

        // Deep copy the array to prevent external mutations affecting our storage
        this.storage.set(bookId, {
            mimeType: artifact.mimeType,
            data: new Uint8Array(artifact.data)
        });
        
        // Clear any old blob URL to prevent memory leaks
        const oldUrl = this.urlCache.get(bookId);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(bookId);
        }
    }
    
    public async getCoverSource(bookId: string): Promise<CoverSource | null> {
        if (!this.isValidId(bookId)) {
            throw new Error(`INVALID_DOCUMENT_ID: Book ID "${bookId}" is malformed or potentially unsafe.`);
        }

        const artifact = this.storage.get(bookId);
        if (!artifact) {
            return null;
        }

        // Return cached URL if available
        const cachedUrl = this.urlCache.get(bookId);
        if (cachedUrl) {
            return { url: cachedUrl };
        }

        const blob = new Blob([artifact.data as unknown as BlobPart], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        
        this.urlCache.set(bookId, url);
        return { url };
    }
    
    public async deleteCover(bookId: string): Promise<void> {
        if (!this.isValidId(bookId)) {
            throw new Error(`INVALID_DOCUMENT_ID: Book ID "${bookId}" is malformed or potentially unsafe.`);
        }

        this.storage.delete(bookId);
        
        const oldUrl = this.urlCache.get(bookId);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(bookId);
        }
    }

    public async hasCover(bookId: string): Promise<boolean> {
        return this.storage.has(bookId);
    }
}
