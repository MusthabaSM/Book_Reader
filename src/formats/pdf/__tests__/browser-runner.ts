import { BrowserDocumentStorageRepository } from '../../../library/repository/browser-document';
import { PdfEngine } from '../engine';
import { generateTestPdfFixtures } from './generate-fixtures';

/**
 * Minimal offline verification for PDF.js to prove the worker and engine boundary
 * operate securely and accurately inside the actual browser.
 */
export async function runPdfOfflineTest() {
    console.log('[PDF Test] Generating fixtures...');
    const fixtures = await generateTestPdfFixtures();
    const repo = new BrowserDocumentStorageRepository();
    
    await repo.storeDocument('test-doc', fixtures['mixed.pdf']);
    const source = await repo.getDocumentSource('test-doc');
    console.log('[PDF Test] Generated Blob URL:', source.url);

    console.log('[PDF Test] Loading Document...');
    const doc = await PdfEngine.loadDocument(source);
    
    console.log('[PDF Test] Document Loaded. Page Count:', doc.getPageCount());
    
    const page0 = await doc.getPage(0); // Portrait
    const page1 = await doc.getPage(1); // Landscape
    
    console.log('[PDF Test] Page 0 Dimensions:', page0.width, 'x', page0.height);
    console.log('[PDF Test] Page 1 Dimensions:', page1.width, 'x', page1.height);
    
    if (page0.width < page0.height) console.log('✅ Page 0 is Portrait');
    else console.error('❌ Page 0 is NOT Portrait');

    if (page1.width > page1.height) console.log('✅ Page 1 is Landscape');
    else console.error('❌ Page 1 is NOT Landscape');

    console.log('[PDF Test] Rendering Page 0 to offscreen canvas...');
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '9999';
    canvas.style.border = '2px solid red';
    canvas.style.transform = 'scale(0.3)';
    canvas.style.transformOrigin = 'top left';
    
    await page0.render(canvas);
    console.log('✅ Canvas Render Complete. Check top left of screen.');

    // Cleanup after 5 seconds
    setTimeout(async () => {
        canvas.remove();
        await doc.destroy();
        await repo.deleteDocument('test-doc');
        console.log('[PDF Test] Destroyed document and cleaned up.');
    }, 5000);
}

// Bind to window for easy invocation during `npm run dev`
(window as any).runPdfOfflineTest = runPdfOfflineTest;
