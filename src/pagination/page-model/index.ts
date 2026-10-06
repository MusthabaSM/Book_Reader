export type ReadingPosition = ReflowablePosition | FixedPosition;

export interface ReflowablePosition {
    type: 'reflowable';
    bookId: string;
    chapterId: string;
    blockId: string;
    inlineOffset?: number; // Character offset within the block's text content
}

export interface FixedPosition {
    type: 'fixed';
    bookId: string;
    pageIndex: number;
    x?: number; // Optional logical x coordinate
    y?: number; // Optional logical y coordinate
}

export interface Geometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type PageElementType = 'text' | 'image' | 'rule' | 'table' | 'code' | 'list-marker';

export interface BasePageElement {
    id: string;
    type: PageElementType;
    geometry: Geometry;
    sourceBlockId?: string; // Maps back to Universal Book Model
    sourceChapterId?: string;
}

export interface TextElement extends BasePageElement {
    type: 'text';
    text: string;
    fontFamily: string;
    fontSize: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
    // For mapping exact selection/reading position
    sourceInlineStart?: number;
    sourceInlineEnd?: number;
}

export interface ImageElement extends BasePageElement {
    type: 'image';
    resourceId: string;
}

export interface RuleElement extends BasePageElement {
    type: 'rule';
}

export interface CodeElement extends BasePageElement {
    type: 'code';
    codeLines: string[];
    fontFamily: string;
    fontSize: number;
}

export type PageElement = TextElement | ImageElement | RuleElement | CodeElement;

export type PresentationPage = ReflowablePresentationPage | FixedPresentationPage;

export interface ReflowablePresentationPage {
    type: 'reflowable';
    id: string;
    pageNumber: number;
    elements: PageElement[];
    startPosition: ReflowablePosition;
    endPosition: ReflowablePosition;
}

export interface FixedPresentationPage {
    type: 'fixed';
    id: string;
    pageNumber: number; // Logical page number
    pageIndex: number;  // 0-indexed internal index
    documentSourceId: string; // Reference to the underlying storage document
    width: number;
    height: number;
    rotation: number;
    format?: string;
}

export interface Spread {
    id: string;
    spreadNumber: number;
    leftPage: PresentationPage | null; // Null if it's the first page (cover) or empty left side
    rightPage: PresentationPage | null;
}
