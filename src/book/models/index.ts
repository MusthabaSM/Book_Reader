export interface Author {
    id: string;
    displayName: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    sortName?: string;
}

export interface Genre {
    id: string;
    name: string;
}

export interface Subject {
    id: string;
    name: string;
}

export type MetadataProvenance = 'file-extracted' | 'filename-inferred' | 'external-provider' | 'user-edited';

export interface MetadataField<T> {
    value: T;
    provenance: MetadataProvenance;
    confidence?: number; // 0 to 1
}

export interface BookMetadata {
    title: MetadataField<string>;
    subtitle?: MetadataField<string>;
    authors: MetadataField<Author[]>;
    contributors?: MetadataField<Author[]>;
    publisher?: MetadataField<string>;
    publicationDate?: MetadataField<string>; // ISO date string
    publicationYear?: MetadataField<number>;
    isbn?: MetadataField<string>;
    language?: MetadataField<string>;
    description?: MetadataField<string>;
    genres: MetadataField<Genre[]>;
    subjects?: MetadataField<Subject[]>;
    series?: MetadataField<string>;
    seriesNumber?: MetadataField<number>;
    edition?: MetadataField<string>;
    
    // File specifics
    originalFilename: string;
    sourceFormat: string;
    fileSizeBytes: number;
    
    coverInfo?: {
        resourceId: string; // Reference to a Resource
    };
}

export interface TocEntry {
    title: string;
    targetChapterId?: string;
    targetBlockId?: string;
    targetPageIndex?: number; // Added for fixed layout / CBZ
    children?: TocEntry[];
}

export interface Resource {
    id: string;
    type: 'image' | 'font' | 'audio' | 'video' | 'attachment';
    mimeType: string;
    // We don't store large binary directly. We store a reference/URL or path.
    url: string; 
    sizeBytes?: number;
    dimensions?: { width: number; height: number }; // For images/video
    altText?: string;
    caption?: string;
}

// ---------------------------------------------------------
// TEXT AND INLINE CONTENT
// ---------------------------------------------------------

export interface TextRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    code?: boolean;
    linkUrl?: string;
}

// ---------------------------------------------------------
// BLOCK CONTENT
// ---------------------------------------------------------

export interface BaseBlock {
    id: string;
}

export interface HeadingBlock extends BaseBlock {
    type: 'heading';
    level: 1 | 2 | 3 | 4 | 5 | 6;
    runs: TextRun[];
}

export interface ParagraphBlock extends BaseBlock {
    type: 'paragraph';
    runs: TextRun[];
}

export interface ImageBlock extends BaseBlock {
    type: 'image';
    resourceId: string; // References a Resource
    alignment?: 'left' | 'center' | 'right';
}

export interface QuoteBlock extends BaseBlock {
    type: 'quote';
    blocks: Block[]; // A quote can contain paragraphs, etc.
}

export interface ListItem {
    runs: TextRun[];
    blocks?: Block[]; // Complex list items can contain other blocks
}

export interface ListBlock extends BaseBlock {
    type: 'list';
    ordered: boolean;
    items: ListItem[];
}

export interface TableCell {
    blocks: Block[]; // A cell can contain paragraphs, lists, etc.
    colSpan?: number;
    rowSpan?: number;
    header?: boolean;
    alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface TableRow {
    cells: TableCell[];
}

export interface TableBlock extends BaseBlock {
    type: 'table';
    rows: TableRow[];
}

export interface CodeBlock extends BaseBlock {
    type: 'code';
    code: string;
    language?: string;
}

export interface HorizontalRuleBlock extends BaseBlock {
    type: 'horizontal-rule';
}

export interface PageBreakBlock extends BaseBlock {
    type: 'page-break';
}

export type Block = 
    | HeadingBlock 
    | ParagraphBlock 
    | ImageBlock 
    | QuoteBlock 
    | ListBlock 
    | TableBlock 
    | CodeBlock 
    | HorizontalRuleBlock 
    | PageBreakBlock;

// ---------------------------------------------------------
// CHAPTER AND BOOK
// ---------------------------------------------------------

export interface Chapter {
    id: string;
    title?: string;
    orderNumber?: number;
    blocks: Block[];
    subChapters?: Chapter[];
}

export interface BaseDocument {
    id: string; // Stable internal ID
    metadata: BookMetadata;
    resources: Record<string, Resource>; // Map of resourceId -> Resource
    toc?: TocEntry[]; // Table of Contents
}

export interface Book extends BaseDocument {
    type: 'reflowable';
    chapters: Chapter[];
}

import type { FixedDocument } from './fixed';
export type DocumentContent = Book | FixedDocument;

