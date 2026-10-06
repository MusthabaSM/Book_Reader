import type { BookImporter, FormatIdentifier } from '../models';
import type { DocumentStorageRepository } from '../../library/repository';
import { TxtImporter } from './txt';
import { EpubImporter } from './epub';
import { PdfImporter } from './pdf/importer';
import { CbzImporter } from './cbz/importer';

export class ImporterRegistry {
    private importers: Set<BookImporter> = new Set();
    private formatMap: Map<FormatIdentifier, BookImporter> = new Map();

    constructor(documentStorage?: DocumentStorageRepository) {
        this.register(new TxtImporter());
        this.register(new EpubImporter());
        if (documentStorage) {
            this.register(new PdfImporter(documentStorage));
            this.register(new CbzImporter(documentStorage));
        }
    }

    public register(importer: BookImporter): boolean {
        if (this.importers.has(importer)) {
            return false;
        }
        
        let hasNewFormat = false;
        for (const format of importer.supportedFormats) {
            if (!this.formatMap.has(format)) {
                this.formatMap.set(format, importer);
                hasNewFormat = true;
            }
        }
        
        if (hasNewFormat) {
            this.importers.add(importer);
            return true;
        }
        
        return false;
    }

    public getImporterForFormat(format: FormatIdentifier): BookImporter | undefined {
        return this.formatMap.get(format);
    }

    public isFormatImplemented(format: FormatIdentifier): boolean {
        return this.formatMap.has(format);
    }
    
    public getSupportedFormats(): FormatIdentifier[] {
        // All supported format identifiers (regardless of implementation)
        return [
            'txt', 'epub', 'pdf', 'docx', 'odt', 'rtf', 'html', 
            'md', 'mobi', 'azw', 'azw3', 'fb2', 'cbz', 'cbr', 
            'unknown', 'unsupported'
        ];
    }
    
    public getImplementedFormats(): FormatIdentifier[] {
        return Array.from(this.formatMap.keys());
    }
}
