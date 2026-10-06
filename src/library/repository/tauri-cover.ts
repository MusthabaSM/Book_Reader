import { BaseDirectory, remove, mkdir, exists, writeFile, readFile } from '@tauri-apps/plugin-fs';
import type { CoverStorageRepository, CoverArtifact, CoverSource } from './index';

export class TauriCoverStorageRepository implements CoverStorageRepository {
    private readonly coversDir: string;
    private urlCache = new Map<string, string>();

    constructor(coversDir: string = 'book_covers') {
        this.coversDir = coversDir;
    }

    private isValidId(id: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(id);
    }

    private getFilename(id: string): string {
        return `${this.coversDir}/${id}`;
    }

    private async ensureDir() {
        try {
            await mkdir(this.coversDir, { baseDir: BaseDirectory.AppData, recursive: true });
        } catch (e: any) {
            if (!e.message?.includes('exists')) {
                console.warn('Could not create book_covers directory:', e);
            }
        }
    }

    public async storeCover(bookId: string, artifact: CoverArtifact): Promise<void> {
        if (!this.isValidId(bookId)) {
            throw new Error(`INVALID_DOCUMENT_ID: Book ID "${bookId}" is malformed or potentially unsafe.`);
        }
        if (artifact.data.byteLength === 0) {
            throw new Error('EMPTY_COVER: Cannot store an empty cover.');
        }

        await this.ensureDir();
        
        // We always use the generic extension-less filename `bookId` 
        // to abstract away the mimeType on the filesystem.
        const filename = this.getFilename(bookId);
        
        try {
            // Write the actual binary data. We prepend the mimeType so we can recover it when reading.
            const mimeTypeBuffer = new TextEncoder().encode(artifact.mimeType + '\n');
            const combinedBuffer = new Uint8Array(mimeTypeBuffer.length + artifact.data.length);
            combinedBuffer.set(mimeTypeBuffer);
            combinedBuffer.set(artifact.data, mimeTypeBuffer.length);
            
            await writeFile(filename, combinedBuffer, { baseDir: BaseDirectory.AppData });
        } catch (e: any) {
            throw new Error(`STORAGE_UNSUPPORTED: Tauri plugin-fs writeFile failed for cover. ${e.message}`);
        }
        
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

        const cachedUrl = this.urlCache.get(bookId);
        if (cachedUrl) {
            return { url: cachedUrl };
        }

        const filename = this.getFilename(bookId);
        
        let data: Uint8Array;
        try {
            if (!(await exists(filename, { baseDir: BaseDirectory.AppData }))) {
                return null;
            }
            data = await readFile(filename, { baseDir: BaseDirectory.AppData });
        } catch (e) {
            return null; // Don't throw for missing covers
        }

        // Extract mimeType from the first line
        const headerEndIndex = data.indexOf(10); // 10 is '\n'
        if (headerEndIndex === -1) {
            return null; // Corrupt cover
        }
        
        const mimeTypeBuffer = data.slice(0, headerEndIndex);
        const mimeType = new TextDecoder().decode(mimeTypeBuffer);
        const imageBytes = data.slice(headerEndIndex + 1);

        const blob = new Blob([imageBytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        this.urlCache.set(bookId, url);
        return { url };
    }

    public async deleteCover(bookId: string): Promise<void> {
        if (!this.isValidId(bookId)) return;
        
        const filename = this.getFilename(bookId);
        try {
            if (await exists(filename, { baseDir: BaseDirectory.AppData })) {
                await remove(filename, { baseDir: BaseDirectory.AppData });
            }
        } catch (e: any) {
            console.error(`Failed to delete cover ${bookId}:`, e);
        }

        const oldUrl = this.urlCache.get(bookId);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            this.urlCache.delete(bookId);
        }
    }

    public async hasCover(bookId: string): Promise<boolean> {
        if (!this.isValidId(bookId)) return false;
        try {
            return await exists(this.getFilename(bookId), { baseDir: BaseDirectory.AppData });
        } catch {
            return false;
        }
    }
}
