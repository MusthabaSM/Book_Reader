import type { DocumentStorageRepository, DocumentSource } from './index';
import { get, set, del } from 'idb-keyval';

export class BrowserDocumentStorageRepository implements DocumentStorageRepository {
    private urlCache = new Map<string, string>();

    private isValidId(id: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    public async storeDocument(id: string, data: Uint8Array): Promise<void> {
        if (!this.isValidId(id)) throw new Error(`INVALID_DOCUMENT_ID`);
        if (data.byteLength === 0) throw new Error('EMPTY_DOCUMENT');

        await set(`doc_${id}`, data);
        
        const oldUrl = this.urlCache.get(id);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(id);
        }
    }
    
    public async getDocumentSource(id: string): Promise<DocumentSource> {
        if (!this.isValidId(id)) throw new Error(`INVALID_DOCUMENT_ID`);

        const data = await get(`doc_${id}`);
        if (!data) throw new Error(`DOCUMENT_NOT_FOUND`);

        let url = this.urlCache.get(id);
        if (!url) {
            const blob = new Blob([data as any], { type: 'application/pdf' });
            url = URL.createObjectURL(blob);
            this.urlCache.set(id, url);
        }

        return { url };
    }
    
    public async deleteDocument(id: string): Promise<void> {
        if (!this.isValidId(id)) return;
        await del(`doc_${id}`);
        const oldUrl = this.urlCache.get(id);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(id);
        }
    }
    
    public async hasDocument(id: string): Promise<boolean> {
        if (!this.isValidId(id)) return false;
        const keys = await import('idb-keyval').then(m => m.keys());
        return keys.includes(`doc_${id}`);
    }
}
