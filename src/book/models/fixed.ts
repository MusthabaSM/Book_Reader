import type { BaseDocument } from './index';

export interface FixedDocumentPage {
    pageIndex: number;
    width: number;
    height: number;
    rotation: number;
}

export interface FixedDocument extends BaseDocument {
    type: 'fixed';
    documentSourceId: string;
    pageCount: number;
    pages: FixedDocumentPage[];
}
