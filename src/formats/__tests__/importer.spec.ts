import { FormatDetector } from '../detector';
import { MockFileDataSource } from './mock-data-source';
import { ImporterRegistry } from '../importers/registry';
import { TxtImporter } from '../importers/txt';
import type { FileInput } from '../models';

async function runTests() {
    console.log('Running importer tests...');
    
    let failed = 0;
    let passed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    const detector = new FormatDetector();

    // 1. Detect .txt
    const txtFile: FileInput = { fileName: 'test.txt', extension: '.txt', fileSizeBytes: 100, dataSource: new MockFileDataSource('Hello\n\nWorld') };
    assert((await detector.detect(txtFile)).format === 'txt', 'Detect .txt');

    // 2. Detect .epub by extension fallback
    const epubFile: FileInput = { fileName: 'book.epub', extension: '.epub', fileSizeBytes: 100, dataSource: new MockFileDataSource(null) };
    assert((await detector.detect(epubFile)).format === 'epub', 'Detect .epub by extension fallback');

    // 3. Detect .pdf by extension fallback
    const pdfFile: FileInput = { fileName: 'doc.pdf', extension: '.pdf', fileSizeBytes: 100, dataSource: new MockFileDataSource(null) };
    assert((await detector.detect(pdfFile)).format === 'pdf', 'Detect .pdf by extension fallback');

    // 4. Unknown extension
    const unknownFile: FileInput = { fileName: 'file.xyz', extension: '.xyz', fileSizeBytes: 100, dataSource: new MockFileDataSource(null) };
    assert((await detector.detect(unknownFile)).format === 'unknown', 'Detect unknown extension');
    
    // 6. Registry lookup
    const registry = new ImporterRegistry();
    assert(registry.getImporterForFormat('txt') instanceof TxtImporter, 'Registry lookup');

    // 7. Duplicate importer registration
    const duplicateTxtImporter = new TxtImporter();
    assert(registry.register(duplicateTxtImporter) === false, 'Duplicate importer registration rejected');
    
    const txtImporter = new TxtImporter();

    // 8, 11, 12, 13. Import result success
    const result = await txtImporter.import(txtFile);
    assert(result.status === 'success', 'Import result success');
    if (result.status === 'success') {
        const book = result.document as import('../../book/models').Book;
        assert(book.chapters.length === 1, 'TXT -> Chapter');
        assert(book.chapters[0].blocks.length === 2, 'TXT -> Paragraph blocks');
    }

    // 14. Empty TXT handling
    const emptyFile: FileInput = { fileName: 'empty.txt', extension: '.txt', fileSizeBytes: 0, dataSource: new MockFileDataSource('') };
    const emptyResult = await txtImporter.import(emptyFile);
    assert(emptyResult.status === 'success' && ((emptyResult as any).document as import('../../book/models').Book).chapters[0].blocks.length === 0, 'Empty TXT handling');

    // Partial/Failure cases are conceptually supported by the types, but we test the failure branch
    const invalidFile: FileInput = { fileName: 'invalid.txt', extension: '.txt', fileSizeBytes: 100, dataSource: new MockFileDataSource(12345) };
    const failResult = await txtImporter.import(invalidFile);
    assert(failResult.status === 'failure', 'Import result failure');

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) throw new Error('Tests failed');
}

runTests().catch(e => {
    console.error('Test script failed:', e);
    throw e;
});
