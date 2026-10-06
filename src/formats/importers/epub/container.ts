import { parseXml, getElementsByTagNameNSOrNot, normalizePath } from './utils';

export function getRootfileFromContainer(xmlContent: string): string | null {
    try {
        const doc = parseXml(xmlContent);
        const rootfiles = getElementsByTagNameNSOrNot(doc, '', 'rootfile');
        
        for (const rootfile of rootfiles) {
            const fullPath = rootfile.getAttribute('full-path');
            const mediaType = rootfile.getAttribute('media-type');
            if (fullPath && mediaType === 'application/oebps-package+xml') {
                return normalizePath(fullPath);
            }
        }
    } catch (e) {
        // XML parsing failure
    }
    return null;
}
