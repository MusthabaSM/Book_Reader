import { test, assert } from 'vitest';
import { ImporterRegistry } from '../registry';
import { BrowserDocumentStorageRepository } from '../../../library/repository/browser-document';

test('ImporterRegistry resolves all default importers correctly', () => {
    console.log('Running ImporterRegistry tests...');
    
    // 1. Without storage repository (TXT, EPUB only)
    const basicRegistry = new ImporterRegistry();
    
    const txtImporter = basicRegistry.getImporterForFormat('txt');
    assert(txtImporter !== undefined, 'TXT importer can be resolved');
    assert(txtImporter?.constructor.name === 'TxtImporter', 'TXT importer is correct type');

    const epubImporter = basicRegistry.getImporterForFormat('epub');
    assert(epubImporter !== undefined, 'EPUB importer can be resolved');
    assert(epubImporter?.constructor.name === 'EpubImporter', 'EPUB importer is correct type');

    const basicPdfImporter = basicRegistry.getImporterForFormat('pdf');
    assert(basicPdfImporter === undefined, 'PDF importer is NOT resolved without storage repo');

    // 2. With storage repository (TXT, EPUB, PDF)
    const storageRepo = new BrowserDocumentStorageRepository();
    const fullRegistry = new ImporterRegistry(storageRepo);
    
    const fullPdfImporter = fullRegistry.getImporterForFormat('pdf');
    assert(fullPdfImporter !== undefined, 'PDF importer can be resolved with storage repo');
    assert(fullPdfImporter?.constructor.name === 'PdfImporter', 'PDF importer is correct type');

    // Verify TXT and EPUB are still present
    assert(fullRegistry.getImporterForFormat('txt') !== undefined, 'TXT importer still resolves');
    assert(fullRegistry.getImporterForFormat('epub') !== undefined, 'EPUB importer still resolves');

    console.log('✅ PASS: ImporterRegistry resolutions');
});
