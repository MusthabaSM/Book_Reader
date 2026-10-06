/**
 * @vitest-environment happy-dom
 */
import { test, expect } from 'vitest';
import { createFileInputFromBrowserFile } from '../browser-file';
import { FormatDetector } from '../../../formats/detector';

test('createFileInputFromBrowserFile - TXT', async () => {
    const file = new File(['Hello world'], 'book.txt', { type: 'text/plain' });
    const fileInput = await createFileInputFromBrowserFile(file);
    
    expect(fileInput.fileName).toBe('book.txt');
    expect(fileInput.extension).toBe('.txt');
    expect(fileInput.mimeType).toBe('text/plain');
    
    const text = await fileInput.dataSource.readText();
    expect(text).toBe('Hello world');
    
    const detector = new FormatDetector();
    const result = await detector.detect(fileInput);
    expect(result.format).toBe('txt');
});

test('createFileInputFromBrowserFile - EPUB', async () => {
    const epubBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // ZIP signature
    const file = new File([epubBytes], 'book.epub', { type: 'application/epub+zip' });
    const fileInput = await createFileInputFromBrowserFile(file);
    
    expect(fileInput.fileName).toBe('book.epub');
    expect(fileInput.extension).toBe('.epub');
    expect(fileInput.mimeType).toBe('application/epub+zip');
    
    const bytes = await fileInput.dataSource.readBytes();
    expect(bytes[0]).toBe(0x50);
    
    const detector = new FormatDetector();
    const result = await detector.detect(fileInput);
    expect(result.format).toBe('epub');
});

test('createFileInputFromBrowserFile - PDF', async () => {
    // We mock PDF magic bytes
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35]); // %PDF-1.5
    const file = new File([pdfBytes], 'book.pdf', { type: 'application/pdf' });
    const fileInput = await createFileInputFromBrowserFile(file);
    
    expect(fileInput.fileName).toBe('book.pdf');
    expect(fileInput.extension).toBe('.pdf');
    expect(fileInput.mimeType).toBe('application/pdf');
    
    const header = await fileInput.dataSource.readHeader(5);
    const headerStr = new TextDecoder('ascii').decode(header);
    expect(headerStr).toBe('%PDF-');
    
    const detector = new FormatDetector();
    const result = await detector.detect(fileInput);
    expect(result.format).toBe('pdf');
    expect(result.method).toBe('magic-bytes');
});
