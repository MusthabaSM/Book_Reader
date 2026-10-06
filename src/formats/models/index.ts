import type { DocumentContent } from '../../book/models';

export interface FileDataSource {
    readBytes(): Promise<Uint8Array>;
    readText(): Promise<string>;
    readHeader(bytes?: number): Promise<Uint8Array>;
}

export interface FileInput {
    fileName: string;
    extension: string; // e.g. '.epub'
    mimeType?: string;
    fileSizeBytes: number;
    // dataSource provides an abstraction over the underlying file data (e.g. Browser File)
    // allowing importers to obtain the precise format they need without loading the whole file into memory blindly.
    dataSource: FileDataSource;
}

export type FormatIdentifier = 
    | 'txt' 
    | 'epub' 
    | 'pdf' 
    | 'docx' 
    | 'odt' 
    | 'rtf' 
    | 'html' 
    | 'md' 
    | 'mobi' 
    | 'azw' 
    | 'azw3' 
    | 'fb2' 
    | 'cbz' 
    | 'cbr'
    | 'unknown'
    | 'unsupported';

export type DetectionMethod = 'magic-bytes' | 'mime' | 'extension' | 'unknown';

export interface DetectionResult {
    format: FormatIdentifier;
    confidence: number; // 0 to 1
    method: DetectionMethod;
    warnings?: string[];
}

export interface ImportWarning {
    code: string;
    message: string;
    level: 'info' | 'warning';
}

export interface ImportError {
    code: string;
    message: string;
    details?: unknown;
}

export type ImportArtifact = 
    | { kind: 'document-binary'; id: string; }
    | { kind: 'cover-image'; id: string; data: Uint8Array; mimeType: string; };

export interface ImportResultSuccess {
    status: 'success';
    document: DocumentContent;
    artifacts?: ImportArtifact[];
}

export interface ImportResultPartial {
    status: 'partial_success';
    document: DocumentContent;
    warnings: ImportWarning[];
    artifacts?: ImportArtifact[];
}

export interface ImportResultFailure {
    status: 'failure';
    error: ImportError;
}

export type ImportResult = ImportResultSuccess | ImportResultPartial | ImportResultFailure;

export interface BookImporter {
    /**
     * The formats this importer claims to support.
     */
    supportedFormats: FormatIdentifier[];
    
    /**
     * Determines if this importer can actually handle the specific file.
     */
    canImport(file: FileInput): Promise<boolean>;
    
    /**
     * Executes the full import process, potentially parsing the file asynchronously.
     */
    import(file: FileInput): Promise<ImportResult>;
}
