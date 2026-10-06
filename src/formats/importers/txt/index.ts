import type { BookImporter, FileInput, ImportResult, FormatIdentifier, ImportArtifact } from '../../models';
import type { Chapter, ParagraphBlock } from '../../../book/models';

export class TxtImporter implements BookImporter {
    public supportedFormats: FormatIdentifier[] = ['txt'];

    public async canImport(file: FileInput): Promise<boolean> {
        return file.extension.toLowerCase() === '.txt' || file.mimeType === 'text/plain';
    }

    public async import(file: FileInput): Promise<ImportResult> {
        try {
            let rawText: string;
            try {
                rawText = await file.dataSource.readText();
            } catch (err) {
                return {
                    status: 'failure',
                    error: {
                        code: 'TXT_INVALID_DATA',
                        message: 'TXT importer failed to read text from dataSource'
                    }
                };
            }
            const paragraphs = rawText.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
            
            const blocks = paragraphs.map((text, i) => {
                const block: ParagraphBlock = {
                    id: `p-${i}`,
                    type: 'paragraph',
                    runs: [{ text }]
                };
                return block;
            });

            const chapter: Chapter = {
                id: 'chapter-1',
                title: 'Main Content',
                blocks
            };

            const title = file.fileName;
            const fileRef = `file-${Date.now()}`;
            const chapters = [chapter];
            const artifacts: ImportArtifact[] = [
                { kind: 'document-binary', id: fileRef }
            ];

            try {
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 450;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const hue = (title.length * 15) % 360;
                    ctx.fillStyle = `hsl(${hue}, 40%, 30%)`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    
                    ctx.font = 'bold 24px sans-serif';
                    const words = title.split(' ');
                    let line = '';
                    let y = 100;
                    for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const metrics = ctx.measureText(testLine);
                        const testWidth = metrics.width;
                        if (testWidth > canvas.width - 40 && n > 0) {
                            ctx.fillText(line, canvas.width / 2, y);
                            line = words[n] + ' ';
                            y += 30;
                        }
                        else {
                            line = testLine;
                        }
                    }
                    ctx.fillText(line, canvas.width / 2, y);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    const base64 = dataUrl.split(',')[1];
                    const binaryString = atob(base64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    artifacts.push({
                        kind: 'cover-image',
                        id: fileRef,
                        mimeType: 'image/jpeg',
                        data: bytes
                    });
                }
            } catch (e) {
                console.warn('Failed to generate TXT cover', e);
            }

            return {
                status: 'success',
                document: {
                    type: 'reflowable',
                    id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    metadata: {
                        title: { value: title, provenance: 'filename-inferred' },
                        authors: { value: [], provenance: 'filename-inferred' },
                        genres: { value: [], provenance: 'filename-inferred' },
                        originalFilename: file.fileName,
                        sourceFormat: 'txt',
                        fileSizeBytes: file.fileSizeBytes,
                        coverInfo: artifacts.some(a => a.kind === 'cover-image') ? { resourceId: fileRef } : undefined
                    },
                    chapters,
                    resources: {}
                },
                artifacts
            };
        } catch (e: any) {
            return {
                status: 'failure',
                error: {
                    code: 'TXT_IMPORT_ERROR',
                    message: e.message || 'Unknown error occurred during TXT import'
                }
            };
        }
    }
}
