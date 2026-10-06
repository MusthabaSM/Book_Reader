import type { FileInput, DetectionResult, FormatIdentifier } from '../models';

export class FormatDetector {
    private extensionMap: Record<string, FormatIdentifier> = {
        '.txt': 'txt',
        '.epub': 'epub',
        '.pdf': 'pdf',
        '.docx': 'docx',
        '.odt': 'odt',
        '.rtf': 'rtf',
        '.html': 'html',
        '.htm': 'html',
        '.md': 'md',
        '.mobi': 'mobi',
        '.azw': 'azw',
        '.azw3': 'azw3',
        '.fb2': 'fb2',
        '.cbz': 'cbz',
        '.cbr': 'cbr'
    };

    private mimeMap: Record<string, FormatIdentifier> = {
        'text/plain': 'txt',
        'application/epub+zip': 'epub',
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.oasis.opendocument.text': 'odt',
        'application/rtf': 'rtf',
        'text/html': 'html',
        'text/markdown': 'md'
    };

    public registerFormat(extension: string, mimeType: string, formatId: FormatIdentifier) {
        this.extensionMap[extension] = formatId;
        this.mimeMap[mimeType] = formatId;
    }

    public async detect(file: FileInput): Promise<DetectionResult> {
        const warnings: string[] = ['Magic bytes detection mostly unimplemented in Phase 3. Falling back to MIME or extension.'];

        // Priority 1: Magic Bytes (Future/Partial)
        try {
            const headerBytes = await file.dataSource.readHeader(5);
            if (headerBytes.length >= 5) {
            // Check for '%PDF-'
            const header = new TextDecoder('ascii').decode(headerBytes.slice(0, 5));
            if (header === '%PDF-') {
                return {
                    format: 'pdf',
                    confidence: 1.0,
                    method: 'magic-bytes'
                };
            }
            }
        } catch (err) {
            warnings.push('Failed to read magic bytes');
        }

        // Priority 2: MIME type
        if (file.mimeType && this.mimeMap[file.mimeType]) {
            return {
                format: this.mimeMap[file.mimeType],
                confidence: 0.8,
                method: 'mime',
                warnings
            };
        }

        // Priority 3: Extension
        const ext = file.extension.toLowerCase();
        if (this.extensionMap[ext]) {
            return {
                format: this.extensionMap[ext],
                confidence: 0.5,
                method: 'extension',
                warnings
            };
        }

        return {
            format: 'unknown',
            confidence: 0,
            method: 'unknown',
            warnings
        };
    }
}
