import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

export async function generateTestPdfFixtures(): Promise<{ [key: string]: Uint8Array }> {
    const fixtures: { [key: string]: Uint8Array } = {};

    // 1. One-page portrait
    let pdf = await PDFDocument.create();
    let page = pdf.addPage([595.28, 841.89]); // A4
    page.drawText('One Page Portrait', { x: 50, y: 800, size: 24 });
    fixtures['portrait-pdf'] = await pdf.save();

    // 2. Multi-page
    pdf = await PDFDocument.create();
    pdf.addPage([595.28, 841.89]);
    pdf.addPage([595.28, 841.89]);
    pdf.addPage([595.28, 841.89]);
    fixtures['multipage-pdf'] = await pdf.save();

    // 3. Landscape
    pdf = await PDFDocument.create();
    page = pdf.addPage([841.89, 595.28]); // A4 Landscape
    page.drawText('Landscape Page', { x: 50, y: 500, size: 24 });
    fixtures['landscape-pdf'] = await pdf.save();

    // 4. Mixed page dimensions
    pdf = await PDFDocument.create();
    pdf.addPage([595.28, 841.89]); // Portrait
    pdf.addPage([841.89, 595.28]); // Landscape
    pdf.addPage([400, 400]); // Square
    fixtures['mixed-pdf'] = await pdf.save();

    // 5. Rotated page
    pdf = await PDFDocument.create();
    page = pdf.addPage([595.28, 841.89]);
    page.setRotation(degrees(90));
    fixtures['rotated-pdf'] = await pdf.save();

    // 6. Text PDF
    pdf = await PDFDocument.create();
    const timesRomanFont = await pdf.embedFont(StandardFonts.TimesRoman);
    page = pdf.addPage([595.28, 841.89]);
    page.drawText('Hello World. This is a test string.', {
        font: timesRomanFont,
        x: 50,
        y: 800,
        size: 14
    });
    fixtures['text-pdf'] = await pdf.save();

    // 7. Deliberately corrupted PDF (completely random bytes)
    const randomBytes = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    fixtures['corrupted-pdf'] = randomBytes;

    // 8. Malformed PDF with a valid `%PDF-` header but garbage structure
    const malformedBytes = new Uint8Array(1000);
    const header = new TextEncoder().encode('%PDF-1.4\n%äãÏÒ\n');
    malformedBytes.set(header, 0);
    for (let i = header.length; i < 1000; i++) malformedBytes[i] = Math.floor(Math.random() * 256);
    fixtures['malformed-pdf'] = malformedBytes;

    return fixtures;
}
