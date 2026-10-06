import { BaseDirectory, remove, mkdir, exists, writeFile } from '@tauri-apps/plugin-fs';
import type { DocumentStorageRepository, DocumentSource } from './index';

export class TauriDocumentStorageRepository implements DocumentStorageRepository {
    private readonly documentsDir: string;

    constructor(documentsDir: string = 'documents') {
        this.documentsDir = documentsDir;
    }

    private isValidId(id: string): boolean {
        // Must be alphanumeric/UUID format. Rejects paths like ../, C:\, etc.
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    private getFilename(id: string): string {
        return `${this.documentsDir}/${id}.pdf`;
    }

    private async ensureDir() {
        try {
            await mkdir(this.documentsDir, { baseDir: BaseDirectory.AppData, recursive: true });
        } catch (e: any) {
            if (!e.message?.includes('exists')) {
                console.warn('Could not create documents directory:', e);
            }
        }
    }

    public async storeDocument(id: string, data: Uint8Array): Promise<void> {
        if (!this.isValidId(id)) {
            throw new Error(`INVALID_DOCUMENT_ID: Document ID "${id}" is malformed or potentially unsafe.`);
        }
        if (data.byteLength === 0) {
            throw new Error('EMPTY_DOCUMENT: Cannot store an empty document.');
        }

        await this.ensureDir();
        const filename = this.getFilename(id);

        // Note: For large binary files, plugin-fs currently expects string data for writeTextFile if writeBinaryFile is absent.
        // Wait, plugin-fs in Tauri 2 has `writeFile` for Uint8Array binaries. Let's use it.
        try {
            await writeFile(filename, data, { baseDir: BaseDirectory.AppData });
        } catch (e: any) {
            throw new Error(`STORAGE_UNSUPPORTED: Tauri plugin-fs writeFile failed. ${e.message}`);
        }
    }
    
    public async getDocumentSource(id: string): Promise<DocumentSource> {
        if (!this.isValidId(id)) {
            throw new Error(`INVALID_DOCUMENT_ID: Document ID "${id}" is malformed or potentially unsafe.`);
        }

        const hasDoc = await this.hasDocument(id);
        if (!hasDoc) {
            throw new Error(`DOCUMENT_NOT_FOUND: Document "${id}" does not exist in storage.`);
        }

        // Return the custom protocol URL. 
        // Note: The Rust side of this protocol is defined by contract but unverified locally due to MSVC limits.
        return {
            url: `bookreader://document/${id}`
        };
    }
    
    public async deleteDocument(id: string): Promise<void> {
        if (!this.isValidId(id)) return;
        const filename = this.getFilename(id);
        try {
            await remove(filename, { baseDir: BaseDirectory.AppData });
        } catch (e: any) {
            console.warn(`Failed to delete document ${id}:`, e);
        }
    }
    
    public async hasDocument(id: string): Promise<boolean> {
        if (!this.isValidId(id)) return false;
        const filename = this.getFilename(id);
        try {
            return await exists(filename, { baseDir: BaseDirectory.AppData });
        } catch {
            return false;
        }
    }
}
