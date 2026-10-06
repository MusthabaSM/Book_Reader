import { DOMParser } from '@xmldom/xmldom';

export function normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');
    normalized = normalized.replace(/^\/+/, '');
    
    const parts = normalized.split('/');
    const result: string[] = [];
    for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (result.length > 0) result.pop();
        } else {
            result.push(part);
        }
    }
    return result.join('/');
}

export function resolveRelativePath(basePath: string, relativePath: string): string {
    if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(relativePath)) {
        return relativePath;
    }

    const lastSlashIdx = basePath.lastIndexOf('/');
    const baseDir = lastSlashIdx >= 0 ? basePath.substring(0, lastSlashIdx + 1) : '';
    return normalizePath(baseDir + relativePath);
}

export function parseXml(xmlStr: string): Document {
    const parser = new DOMParser({
        onError: (level: string, msg: string) => {
            if (level === 'fatalError') throw new Error(`Fatal XML Parse error: ${msg}`);
            if (level === 'error') console.warn('XML Parse error:', msg);
        }
    } as any);
    return parser.parseFromString(xmlStr, 'application/xml') as unknown as Document;
}

export function parseXhtml(htmlStr: string): Document {
    const parser = new DOMParser({
        onError: (level: string, msg: string) => {
            if (level === 'fatalError') throw new Error(`Fatal XHTML Parse error: ${msg}`);
        }
    } as any);
    return parser.parseFromString(htmlStr, 'application/xhtml+xml') as unknown as Document;
}

export function getElementsByTagNameNSOrNot(node: Element | Document, _namespace: string, localName: string): Element[] {
    // A robust helper for extracting tags ignoring namespace prefix differences if xmldom struggles
    const results: Element[] = [];
    const elements = node.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.localName === localName || el.nodeName === localName || el.nodeName.endsWith(`:${localName}`)) {
            results.push(el);
        }
    }
    return results;
}
