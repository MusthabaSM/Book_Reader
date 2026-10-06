import type { FileInput, FileDataSource } from '../../formats/models';

class BrowserFileDataSource implements FileDataSource {
    private file: File;
    constructor(file: File) {
        this.file = file;
    }
    
    async readBytes(): Promise<Uint8Array> {
        const buffer = await this.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        console.log(`[BrowserFileDataSource.readBytes] File "${this.file.name}" | file.size: ${this.file.size} | type: ${this.file.type} | arrayBuffer.byteLength: ${buffer.byteLength} | First 16: ${Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        return bytes;
    }
    
    async readText(): Promise<string> {
        return await this.file.text();
    }
    
    async readHeader(bytes: number = 100): Promise<Uint8Array> {
        const slice = this.file.slice(0, bytes);
        const buffer = await slice.arrayBuffer();
        const headerBytes = new Uint8Array(buffer);
        console.log(`[BrowserFileDataSource.readHeader] File "${this.file.name}" | Requested bytes: ${bytes} | Returned bytes: ${headerBytes.byteLength} | First 16: ${Array.from(headerBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        return headerBytes;
    }
}

export async function createFileInputFromBrowserFile(file: File): Promise<FileInput> {
    console.log(`[createFileInputFromBrowserFile] Validating File: name=${file.name}, size=${file.size}, type=${file.type}, isFile=${file instanceof File}`);
    
    const directBuffer = await file.arrayBuffer();
    const directBytes = new Uint8Array(directBuffer);
    console.log(`[createFileInputFromBrowserFile] Direct read arrayBuffer() | length: ${directBytes.length} | First 16: ${Array.from(directBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    let extension = '';
    const lastDotIndex = file.name.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        extension = file.name.substring(lastDotIndex).toLowerCase();
    }

    return {
        fileName: file.name,
        extension,
        mimeType: file.type || 'application/octet-stream',
        fileSizeBytes: file.size,
        dataSource: new BrowserFileDataSource(file)
    };
}
