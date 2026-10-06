import type { FileDataSource } from '../models';

export class MockFileDataSource implements FileDataSource {
    private data: string | Uint8Array | null | any;
    constructor(data: string | Uint8Array | null | any) {
        this.data = data;
    }

    async readBytes(): Promise<Uint8Array> {
        if (this.data instanceof Uint8Array) {
            return this.data;
        }
        if (typeof this.data === 'string') {
            return new TextEncoder().encode(this.data);
        }
        if (this.data === null) {
            return new Uint8Array();
        }
        throw new Error('MockFileDataSource: invalid data type for readBytes');
    }

    async readText(): Promise<string> {
        if (typeof this.data === 'string') {
            return this.data;
        }
        if (this.data instanceof Uint8Array) {
            return new TextDecoder().decode(this.data);
        }
        if (this.data === null) {
            return '';
        }
        throw new Error('MockFileDataSource: invalid data type for readText');
    }

    async readHeader(bytes: number = 100): Promise<Uint8Array> {
        const fullBytes = await this.readBytes();
        return fullBytes.slice(0, bytes);
    }
}
