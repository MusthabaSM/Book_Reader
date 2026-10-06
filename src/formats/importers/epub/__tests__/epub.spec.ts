import JSZip from 'jszip';
import { EpubImporter } from '../index';
import { Paginator } from '../../../../pagination/paginator';
import { MockTextMeasurer } from '../../../../pagination/layout/measurer';
import { defaultPaginationConfig } from '../../../../pagination/layout/config';
import { MockFileDataSource } from '../../../__tests__/mock-data-source';
import type { FileInput, ImportResultSuccess } from '../../../models';
import type { Book } from '../../../../book/models';

async function createEpubBuffer(
    container: string | null = null,
    opf: string | null = null,
    opfPath: string = 'OEBPS/content.opf',
    chapterPath: string = 'OEBPS/chapter1.xhtml',
    chapterContent: string | null = null,
    files: Record<string, string> = {}
): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    
    if (container !== null) {
        zip.file('META-INF/container.xml', container);
    }
    
    if (opf !== null) {
        zip.file(opfPath, opf);
    }

    if (chapterContent !== null) {
        zip.file(chapterPath, chapterContent);
    }

    for (const [path, content] of Object.entries(files)) {
        zip.file(path, content);
    }

    return await zip.generateAsync({ type: 'uint8array' });
}

const defaultContainer = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const defaultOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>
`;

async function runTests() {
    console.log('Running EPUB Importer tests...');
    let passed = 0, failed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    const importer = new EpubImporter();

    // 1. Valid minimal EPUB
    const buffer1 = await createEpubBuffer(
        defaultContainer, 
        defaultOpf,
        'OEBPS/content.opf',
        'OEBPS/chapter1.xhtml',
        `<html><body><p>Hello world!</p></body></html>`
    );
    const file1: FileInput = { fileName: 'test1.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: buffer1.length, dataSource: new MockFileDataSource(buffer1) };
    
    const res1 = await importer.import(file1);
    if (res1.status === 'failure') console.error('RES1 FAILURE:', res1.error);
    const doc1 = (res1 as ImportResultSuccess).document as Book;
    assert(res1.status !== 'failure' && doc1.metadata.title.value === 'Test Book', 'Valid minimal EPUB imports successfully');
    assert(res1.status !== 'failure' && (doc1 as any).chapters.length === 1, 'Extracts 1 chapter');
    assert(res1.status !== 'failure' && (doc1 as any).chapters[0].blocks.length === 1, 'Extracts 1 block');

    // 2. Security: Script tags are ignored
    const buffer2 = await createEpubBuffer(
        defaultContainer, 
        defaultOpf,
        'OEBPS/content.opf',
        'OEBPS/chapter1.xhtml',
        `<html><body><script>alert("hacked");</script><p>Safe text</p><iframe src="evil.com"></iframe></body></html>`
    );
    const file2: FileInput = { fileName: 'test2.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: buffer2.length, dataSource: new MockFileDataSource(buffer2) };
    
    const res2 = await importer.import(file2);
    if (res2.status === 'failure') console.error('RES2 FAILURE:', res2.error);
    const doc2 = (res2 as ImportResultSuccess).document as Book;
    assert(res2.status !== 'failure' && (doc2 as any).chapters[0].blocks.length === 1, 'Security: script and iframe tags are completely stripped');
    
    // 3. Security: Internal path traversal attempt
    // Using ../ outside of root directory shouldn't crash
    const opfTraversal = `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Traversal</dc:title></metadata>
        <manifest>
            <item id="chapter1" href="../../../chapter1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine><itemref idref="chapter1"/></spine>
    </package>
    `;
    const buffer3 = await createEpubBuffer(
        defaultContainer, 
        opfTraversal,
        'OEBPS/content.opf',
        'chapter1.xhtml', // placed at root, though manifest points to ../../../
        `<html><body><p>Traversal</p></body></html>`,
        { 'chapter1.xhtml': '<html><body><p>Traversal</p></body></html>' } // put it at root just in case
    );
    const file3: FileInput = { fileName: 'test3.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: buffer3.length, dataSource: new MockFileDataSource(buffer3) };
    const res3 = await importer.import(file3);
    if (res3.status === 'failure') console.error('RES3 FAILURE:', res3.error);
    assert(res3.status !== 'failure', 'Security: internal path traversal is safely handled (normalizes to root)');

    // 4. Invalid ZIP
    const invalidBuffer = new Uint8Array([1, 2, 3, 4]);
    const file4: FileInput = { fileName: 'test4.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: invalidBuffer.length, dataSource: new MockFileDataSource(invalidBuffer) };
    const res4 = await importer.import(file4);
    assert(res4.status === 'failure' && res4.error?.code === 'EPUB_INVALID_ZIP', 'Invalid/non-ZIP input fails cleanly');

    // 5. Rich EPUB -> Book -> Paginator -> Spreads
    const buffer5 = await createEpubBuffer(
        defaultContainer, 
        defaultOpf,
        'OEBPS/content.opf',
        'OEBPS/chapter1.xhtml',
        `<html>
            <body>
                <h1>Chapter Title</h1>
                <p>This is a <b>bold</b> and <i>italic</i> test.</p>
                <img src="images/cover.jpg" />
                <ul><li>List item</li></ul>
            </body>
        </html>`,
        { 'OEBPS/images/cover.jpg': 'fake-image-data' }
    );
    const file5: FileInput = { fileName: 'test5.epub', extension: '.epub', mimeType: 'application/epub+zip', fileSizeBytes: buffer5.length, dataSource: new MockFileDataSource(buffer5) };
    const res5 = await importer.import(file5);
    if (res5.status === 'failure') console.error('RES5 FAILURE:', res5.error);
    
    assert(res5.status !== 'failure', 'Rich EPUB imports successfully');
    
    if (res5.status !== 'failure') {
        const doc5 = (res5 as ImportResultSuccess).document as Book;
        assert((doc5 as any).chapters[0].blocks.find((b: any) => b.type === 'heading') !== undefined, 'Parsed heading block');
        assert((doc5 as any).chapters[0].blocks.find((b: any) => b.type === 'image') !== undefined, 'Parsed image block');
        
        const paginator = new Paginator();
        const measurer = new MockTextMeasurer();
        const paginated = paginator.paginate(doc5, defaultPaginationConfig, measurer);
        
        assert(paginated.spreads.length > 0, 'EPUB -> Book -> Paginator -> Spreads end-to-end pipeline succeeds');
    }

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) throw new Error('EPUB tests failed');
}

runTests().catch(e => {
    console.error('Test script failed:', e);
    process.exit(1);
});
