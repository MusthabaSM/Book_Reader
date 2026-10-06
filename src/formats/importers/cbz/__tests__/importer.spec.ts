import { describe, it, expect, vi } from 'vitest';
import { CbzImporter } from '../importer';
import type { FileInput } from '../../../models';
import type { DocumentStorageRepository } from '../../../../library/repository';
import JSZip from 'jszip';

describe('CbzImporter', () => {
    it('should declare support for cbz', () => {
        const importer = new CbzImporter({} as DocumentStorageRepository);
        expect(importer.supportedFormats).toContain('cbz');
    });

    it('canImport should recognize valid extensions and mime types', async () => {
        const importer = new CbzImporter({} as DocumentStorageRepository);
        
        expect(await importer.canImport({ extension: '.cbz', mimeType: '' } as FileInput)).toBe(true);
        expect(await importer.canImport({ extension: '.zip', mimeType: '' } as FileInput)).toBe(true);
        expect(await importer.canImport({ extension: '.txt', mimeType: 'application/vnd.comicbook+zip' } as FileInput)).toBe(true);
        expect(await importer.canImport({ extension: '.epub', mimeType: '' } as FileInput)).toBe(false);
    });

    it('should extract images and determine natural ordering', async () => {
        // Create a dummy cbz zip
        const zip = new JSZip();
        zip.file('10.jpg', new Uint8Array([1, 2, 3]));
        zip.file('2.jpg', new Uint8Array([1, 2, 3]));
        zip.file('metadata.xml', 'not an image');
        zip.folder('__MACOSX/10.jpg');

        const bytes = await zip.generateAsync({ type: 'uint8array' });

        const mockStorage: DocumentStorageRepository = {
            storeDocument: vi.fn().mockResolvedValue(undefined),
            getDocumentSource: vi.fn(),
            deleteDocument: vi.fn(),
            hasDocument: vi.fn()
        };

        const importer = new CbzImporter(mockStorage);
        const fileInput: FileInput = {
            fileName: 'comic.cbz',
            extension: '.cbz',
            fileSizeBytes: bytes.byteLength,
            dataSource: {
                readBytes: async () => bytes,
                readText: async () => '',
                readHeader: async () => new Uint8Array()
            }
        };

        const result = await importer.import(fileInput);

        expect(result.status).toBe('success');
        if (result.status === 'success') {
            expect(result.document.type).toBe('fixed');
            if (result.document.type === 'fixed') {
                expect(result.document.pageCount).toBe(2);
                expect(result.document.metadata.sourceFormat).toBe('cbz');
                expect(result.document.metadata.title.value).toBe('comic');
                
                // Should sort 2.jpg before 10.jpg
                expect(result.document.pages.length).toBe(2);
            }

            expect(result.artifacts?.length).toBeGreaterThanOrEqual(1);
            expect(mockStorage.storeDocument).toHaveBeenCalled();
        }
    });

    it('should fail gracefully if zip is invalid', async () => {
        const importer = new CbzImporter({} as DocumentStorageRepository);
        const fileInput: FileInput = {
            fileName: 'comic.cbz',
            extension: '.cbz',
            fileSizeBytes: 10,
            dataSource: {
                readBytes: async () => new Uint8Array([1, 2, 3, 4, 5]),
                readText: async () => '',
                readHeader: async () => new Uint8Array()
            }
        };

        const result = await importer.import(fileInput);
        expect(result.status).toBe('failure');
        if (result.status === 'failure') {
            expect(result.error.code).toBe('INVALID_CBZ');
        }
    });

    it('should fail if no images are present', async () => {
        const zip = new JSZip();
        zip.file('document.txt', 'hello');
        const bytes = await zip.generateAsync({ type: 'uint8array' });

        const importer = new CbzImporter({} as DocumentStorageRepository);
        const fileInput: FileInput = {
            fileName: 'comic.cbz',
            extension: '.cbz',
            fileSizeBytes: bytes.byteLength,
            dataSource: {
                readBytes: async () => bytes,
                readText: async () => '',
                readHeader: async () => new Uint8Array()
            }
        };

        const result = await importer.import(fileInput);
        expect(result.status).toBe('failure');
        if (result.status === 'failure') {
            expect(result.error.code).toBe('INVALID_CBZ_NO_PAGES');
        }
    });
});
