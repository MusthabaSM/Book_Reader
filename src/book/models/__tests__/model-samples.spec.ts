import type { Book, ParagraphBlock, HeadingBlock, CodeBlock, ImageBlock, TableBlock } from '../index';

// 1. A simple TXT-style book
export const simpleTxtBook: Book = {
    type: 'reflowable',
    id: 'book-txt-1',
    metadata: {
        title: { value: 'Simple Text Book', provenance: 'filename-inferred' },
        authors: { value: [{ id: 'a1', displayName: 'Unknown' }], provenance: 'filename-inferred' },
        genres: { value: [], provenance: 'filename-inferred' },
        originalFilename: 'simple.txt',
        sourceFormat: 'txt',
        fileSizeBytes: 1024
    },
    resources: {},
    chapters: [
        {
            id: 'chap-1',
            blocks: [
                {
                    id: 'b1',
                    type: 'paragraph',
                    runs: [{ text: 'This is a simple text file.' }]
                } as ParagraphBlock,
                {
                    id: 'b2',
                    type: 'paragraph',
                    runs: [{ text: 'It has no formatting.' }]
                } as ParagraphBlock
            ]
        }
    ]
};

// 2. An EPUB-style rich book with chapters/images
export const richEpubBook: Book = {
    type: 'reflowable',
    id: 'book-epub-1',
    metadata: {
        title: { value: 'Rich EPUB Book', provenance: 'file-extracted' },
        authors: { value: [{ id: 'a1', displayName: 'Jane Author' }], provenance: 'file-extracted' },
        genres: { value: [{ id: 'g1', name: 'Fantasy' }], provenance: 'file-extracted' },
        originalFilename: 'fantasy_story.epub',
        sourceFormat: 'epub',
        fileSizeBytes: 2048000,
        coverInfo: { resourceId: 'res-cover' }
    },
    resources: {
        'res-cover': {
            id: 'res-cover',
            type: 'image',
            mimeType: 'image/jpeg',
            url: 'memory://res-cover'
        },
        'res-map': {
            id: 'res-map',
            type: 'image',
            mimeType: 'image/png',
            url: 'memory://res-map'
        }
    },
    chapters: [
        {
            id: 'chap-1',
            title: 'Chapter 1: The Beginning',
            blocks: [
                {
                    id: 'b1',
                    type: 'heading',
                    level: 1,
                    runs: [{ text: 'Chapter 1: The Beginning' }]
                } as HeadingBlock,
                {
                    id: 'b2',
                    type: 'image',
                    resourceId: 'res-map',
                    alignment: 'center'
                } as ImageBlock,
                {
                    id: 'b3',
                    type: 'paragraph',
                    runs: [
                        { text: 'Once upon a time, ' },
                        { text: 'very ', italic: true },
                        { text: 'long ago.' }
                    ]
                } as ParagraphBlock
            ]
        }
    ]
};

// 3. A technical/programming book containing code blocks and tables
export const techBook: Book = {
    type: 'reflowable',
    id: 'book-tech-1',
    metadata: {
        title: { value: 'Advanced TypeScript', provenance: 'file-extracted' },
        authors: { value: [{ id: 'a1', displayName: 'Tech Writer' }], provenance: 'file-extracted' },
        genres: { value: [{ id: 'g1', name: 'Programming' }], provenance: 'file-extracted' },
        originalFilename: 'ts_guide.pdf',
        sourceFormat: 'pdf',
        fileSizeBytes: 5000000
    },
    resources: {},
    chapters: [
        {
            id: 'chap-1',
            blocks: [
                {
                    id: 'b1',
                    type: 'heading',
                    level: 2,
                    runs: [{ text: 'Interfaces vs Types' }]
                } as HeadingBlock,
                {
                    id: 'b2',
                    type: 'paragraph',
                    runs: [{ text: 'Here is how you define an interface:' }]
                } as ParagraphBlock,
                {
                    id: 'b3',
                    type: 'code',
                    language: 'typescript',
                    code: 'interface User {\n  name: string;\n}'
                } as CodeBlock,
                {
                    id: 'b4',
                    type: 'table',
                    rows: [
                        {
                            cells: [
                                { blocks: [{ id: 'tb1', type: 'paragraph', runs: [{ text: 'Feature' }] } as ParagraphBlock], header: true },
                                { blocks: [{ id: 'tb2', type: 'paragraph', runs: [{ text: 'Supported' }] } as ParagraphBlock], header: true }
                            ]
                        }
                    ]
                } as TableBlock
            ]
        }
    ]
};

// 4. A book with multiple authors and genres
export const multiAuthorBook: Book = {
    type: 'reflowable',
    id: 'book-multi-1',
    metadata: {
        title: { value: 'Anthology of Science Fiction', provenance: 'external-provider' },
        authors: { 
            value: [
                { id: 'a1', displayName: 'Arthur C. Clarke' },
                { id: 'a2', displayName: 'Isaac Asimov' }
            ], 
            provenance: 'external-provider' 
        },
        genres: { 
            value: [
                { id: 'g1', name: 'Science Fiction' },
                { id: 'g2', name: 'Anthology' }
            ], 
            provenance: 'external-provider' 
        },
        originalFilename: 'anthology.epub',
        sourceFormat: 'epub',
        fileSizeBytes: 3000000
    },
    resources: {},
    chapters: []
};
