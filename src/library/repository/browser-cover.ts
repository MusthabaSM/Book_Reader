import type { CoverStorageRepository, CoverArtifact, CoverSource } from './index';
import { get, set, del, has } from 'idb-keyval';

export class BrowserCoverStorageRepository implements CoverStorageRepository {
    private urlCache = new Map<string, string>();

    private isValidId(id: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    public async storeCover(bookId: string, artifact: CoverArtifact): Promise<void> {
        if (!this.isValidId(bookId)) throw new Error(`INVALID_DOCUMENT_ID`);
        if (artifact.data.byteLength === 0) throw new Error('EMPTY_COVER');

        await set(`cover_${bookId}`, {
            mimeType: artifact.mimeType,
            data: artifact.data
        });
        
        const oldUrl = this.urlCache.get(bookId);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(bookId);
        }
    }
    
    public async getCoverSource(bookId: string): Promise<CoverSource | null> {
        if (!this.isValidId(bookId)) throw new Error(`INVALID_DOCUMENT_ID`);

        const artifact = await get(`cover_${bookId}`);
        if (!artifact) return null;

        const cachedUrl = this.urlCache.get(bookId);
        if (cachedUrl) return { url: cachedUrl };

        const blob = new Blob([artifact.data as unknown as BlobPart], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        
        this.urlCache.set(bookId, url);
        return { url };
    }
    
    public async deleteCover(bookId: string): Promise<void> {
        if (!this.isValidId(bookId)) return;

        await del(`cover_${bookId}`);
        
        const oldUrl = this.urlCache.get(bookId);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(bookId);
        }
    }

    public async hasCover(bookId: string): Promise<boolean> {
        const keys = await import('idb-keyval').then(m => m.keys());
        return keys.includes(`cover_${bookId}`);
    }
}
