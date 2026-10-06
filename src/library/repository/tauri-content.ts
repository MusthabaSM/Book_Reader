import { BaseDirectory, writeTextFile, readTextFile, remove, mkdir, rename } from '@tauri-apps/plugin-fs';
import type { BookContentRepository } from './index';
import type { DocumentContent } from '../../book/models';

export class TauriBookContentRepository implements BookContentRepository {
    private readonly contentDir: string;

    constructor(contentDir: string = 'book_content') {
        this.contentDir = contentDir;
    }

    private async ensureDir() {
        try {
            await mkdir(this.contentDir, { baseDir: BaseDirectory.AppData, recursive: true });
        } catch (e: any) {
            // If it already exists, mkdir might throw, or we just ignore.
            if (!e.message?.includes('exists')) {
                console.warn('Could not create book_content directory, it may already exist:', e);
            }
        }
    }

    private getFilename(bookId: string): string {
        // Sanitize the bookId just in case
        const safeId = bookId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `${this.contentDir}/${safeId}.json`;
    }

    public async get(bookId: string): Promise<DocumentContent | null> {
        const filename = this.getFilename(bookId);
        let json: string;

        try {
            json = await readTextFile(filename, { baseDir: BaseDirectory.AppData });
        } catch (e: any) {
            if (e.message?.includes('os error 2') || e.message?.includes('No such file')) {
                return null;
            }
            throw new Error(`STORAGE_FS_ERROR: Failed to read content file for ${bookId}: ${e.message}`);
        }

        let doc: any;
        try {
            doc = JSON.parse(json);
        } catch (e: any) {
            throw new Error(`STORAGE_CORRUPTION: Content file for ${bookId} is not valid JSON: ${e.message}`);
        }
            
        // Validate basic Universal Book Model structure
        if (!doc || typeof doc !== 'object') {
            throw new Error(`STORAGE_CORRUPTION: Content for ${bookId} is not an object.`);
        }
        if (!doc.id || doc.id !== bookId) {
            throw new Error(`STORAGE_CORRUPTION: Content for ${bookId} has invalid or missing ID.`);
        }
        if (!doc.metadata || typeof doc.metadata !== 'object') {
            throw new Error(`STORAGE_CORRUPTION: Content for ${bookId} is missing metadata.`);
        }

        // Legacy Normalization: If it lacks a type discriminator but has chapters, it is a legacy reflowable Book
        if (!doc.type && Array.isArray(doc.chapters)) {
            doc.type = 'reflowable';
        }

        if (doc.type === 'fixed') {
            if (!Array.isArray(doc.pages)) {
                throw new Error(`STORAGE_CORRUPTION: Fixed document for ${bookId} is missing pages array.`);
            }
            if (typeof doc.documentSourceId !== 'string') {
                throw new Error(`STORAGE_CORRUPTION: Fixed document for ${bookId} is missing documentSourceId.`);
            }
        } else if (doc.type === 'reflowable') {
            if (!Array.isArray(doc.chapters)) {
                throw new Error(`STORAGE_CORRUPTION: Reflowable document for ${bookId} is missing chapters array.`);
            }
        } else {
            throw new Error(`STORAGE_CORRUPTION: Content for ${bookId} has unknown or missing type.`);
        }
            
        return doc as DocumentContent;
    }

    public async store(document: DocumentContent): Promise<void> {
        await this.ensureDir();
        const filename = this.getFilename(document.id);
        const tempFilename = `${filename}.tmp`;

        const json = JSON.stringify(document);
        
        try {
            // Atomic write: Write to a temporary file first
            await writeTextFile(tempFilename, json, { baseDir: BaseDirectory.AppData });
            
            // In a real desktop app, we'd do a file system rename (move) here to guarantee atomicity.
            // @tauri-apps/plugin-fs currently doesn't expose an atomic `rename` directly in JS without `rename` command,
            // but `writeTextFile` to the final destination is typically what is available if `rename` is missing.
            // Let's check if `rename` exists in plugin-fs. Assuming we might not have it, 
            // we will write directly as a pragmatic atomic fallback for Phase 10 if rename fails.
            
            // Wait, Tauri plugin-fs DOES have `rename`. Let's import it.
            await rename(tempFilename, filename, {
                oldPathBaseDir: BaseDirectory.AppData,
                newPathBaseDir: BaseDirectory.AppData
            });
        } catch (e: any) {
            console.error('Failed atomic write, falling back to direct write...', e);
            // Fallback if rename is missing/fails
            await writeTextFile(filename, json, { baseDir: BaseDirectory.AppData });
        }
    }

    public async delete(bookId: string): Promise<void> {
        const filename = this.getFilename(bookId);
        try {
            await remove(filename, { baseDir: BaseDirectory.AppData });
        } catch (e: any) {
            console.warn(`Failed to delete content file for ${bookId}:`, e);
        }
    }
}
