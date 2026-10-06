import type { DocumentStorageRepository, DocumentSource } from './index';

export class BrowserDocumentStorageRepository implements DocumentStorageRepository {
    private storage = new Map<string, Uint8Array>();
    private urlCache = new Map<string, string>();

    private isValidId(id: string): boolean {
        // Validate that the ID is a safe identifier, e.g. alphanumeric/UUID format.
        // We reject path traversal attempts such as ../ or C:\\
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    public async storeDocument(id: string, data: Uint8Array): Promise<void> {
        if (!this.isValidId(id)) {
            throw new Error(`INVALID_DOCUMENT_ID: Document ID "${id}" is malformed or potentially unsafe.`);
        }
        
        if (data.byteLength === 0) {
            throw new Error('EMPTY_DOCUMENT: Cannot store an empty document.');
        }

        // Deep copy the array to prevent external mutations affecting our storage
        this.storage.set(id, new Uint8Array(data));
        
        // Clear any old blob URL to prevent memory leaks
        const oldUrl = this.urlCache.get(id);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(id);
        }
    }
    
    public async getDocumentSource(id: string): Promise<DocumentSource> {
        if (!this.isValidId(id)) {
            throw new Error(`INVALID_DOCUMENT_ID: Document ID "${id}" is malformed or potentially unsafe.`);
        }

        const data = this.storage.get(id);
        if (!data) {
            throw new Error(`DOCUMENT_NOT_FOUND: Document "${id}" does not exist in storage.`);
        }

        let url = this.urlCache.get(id);
        if (!url) {
            const blob = new Blob([data as any], { type: 'application/pdf' }); // Hardcoding PDF for Stage 2 scope
            url = URL.createObjectURL(blob);
            this.urlCache.set(id, url);
        }

        return { url };
    }
    
    public async deleteDocument(id: string): Promise<void> {
        if (!this.isValidId(id)) return; // Ignore invalid deletions safely

        this.storage.delete(id);
        const oldUrl = this.urlCache.get(id);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(id);
        }
    }
    
    public async hasDocument(id: string): Promise<boolean> {
        if (!this.isValidId(id)) return false;
        return this.storage.has(id);
    }
}
