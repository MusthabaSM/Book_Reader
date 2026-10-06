import { parseXml, getElementsByTagNameNSOrNot, resolveRelativePath } from './utils';
import type { ImportWarning } from '../../models';

export interface EpubManifestItem {
    id: string;
    href: string;
    mediaType: string;
    properties?: string;
}

export interface EpubMetadata {
    title: string;
    creator: string[];
    language: string;
    identifier: string;
    coverId?: string;
}

export interface EpubPackage {
    version: string;
    metadata: EpubMetadata;
    manifest: Map<string, EpubManifestItem>;
    spine: string[]; // array of manifest IDs
    warnings: ImportWarning[];
}

export function parsePackageDocument(xmlContent: string, opfPath: string): EpubPackage {
    const warnings: ImportWarning[] = [];
    const doc = parseXml(xmlContent);
    
    const packageNode = getElementsByTagNameNSOrNot(doc, '', 'package')[0];
    const version = packageNode ? (packageNode.getAttribute('version') || '2.0') : '2.0';

    const metadataNode = getElementsByTagNameNSOrNot(doc, '', 'metadata')[0];
    const metadata: EpubMetadata = {
        title: 'Unknown Title',
        creator: [],
        language: 'en',
        identifier: ''
    };

    let coverId: string | undefined;

    if (metadataNode) {
        const titles = getElementsByTagNameNSOrNot(metadataNode, '', 'title');
        if (titles.length > 0) metadata.title = titles[0].textContent || 'Unknown Title';

        const creators = getElementsByTagNameNSOrNot(metadataNode, '', 'creator');
        metadata.creator = creators.map(c => c.textContent || '').filter(t => t.length > 0);

        const languages = getElementsByTagNameNSOrNot(metadataNode, '', 'language');
        if (languages.length > 0) metadata.language = languages[0].textContent || 'en';

        const identifiers = getElementsByTagNameNSOrNot(metadataNode, '', 'identifier');
        if (identifiers.length > 0) metadata.identifier = identifiers[0].textContent || '';

        const metas = getElementsByTagNameNSOrNot(metadataNode, '', 'meta');
        for (const meta of metas) {
            if (meta.getAttribute('name') === 'cover') {
                coverId = meta.getAttribute('content') || undefined;
            }
        }
    } else {
        warnings.push({ code: 'EPUB_MISSING_METADATA', message: 'OPF package missing metadata element', level: 'warning' });
    }

    const manifest = new Map<string, EpubManifestItem>();
    const manifestNode = getElementsByTagNameNSOrNot(doc, '', 'manifest')[0];
    
    if (manifestNode) {
        const items = getElementsByTagNameNSOrNot(manifestNode, '', 'item');
        for (const item of items) {
            const id = item.getAttribute('id');
            let href = item.getAttribute('href');
            const mediaType = item.getAttribute('media-type');
            const properties = item.getAttribute('properties');
            
            if (id && href && mediaType) {
                href = resolveRelativePath(opfPath, href);
                manifest.set(id, { id, href, mediaType, properties: properties || undefined });
                
                if (properties && properties.includes('cover-image')) {
                    coverId = id;
                }
            }
        }
    } else {
        warnings.push({ code: 'EPUB_MISSING_MANIFEST', message: 'OPF package missing manifest element', level: 'warning' });
    }
    
    metadata.coverId = coverId;

    const spine: string[] = [];
    const spineNode = getElementsByTagNameNSOrNot(doc, '', 'spine')[0];
    
    if (spineNode) {
        const itemrefs = getElementsByTagNameNSOrNot(spineNode, '', 'itemref');
        for (const itemref of itemrefs) {
            const idref = itemref.getAttribute('idref');
            if (idref) {
                spine.push(idref);
            }
        }
    } else {
        warnings.push({ code: 'EPUB_MISSING_SPINE', message: 'OPF package missing spine element', level: 'warning' });
    }

    return {
        version,
        metadata,
        manifest,
        spine,
        warnings
    };
}
