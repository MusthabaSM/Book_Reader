import type { DocumentContent, Book } from '../../book/models';
import type { PdfDocumentHandle } from '../../formats/pdf/engine';

export interface SearchMatch {
    id: string; // Unique ID for this match
    pageOrChapterIndex: number; // For PDF: pageIndex, For EPUB: chapterIndex
    snippet: string; // Context snippet around the match to display in UI
    
    // Exact text of the query string for string manipulation during rendering
    matchQuery?: string;
    
    // PDF specific
    pdfMatchRects?: { itemIndex: number, textOffset: number, textLength: number }[]; 
    
    // Reflowable specific
    reflowableBlockId?: string;
}

export class SearchService {
    /**
     * Searches a BookContent for a given query string.
     * For PDFs, requires the PdfDocumentHandleImpl to access PDF.js getTextContent.
     */
    public async search(
        query: string,
        bookContent: DocumentContent,
        pdfHandle?: PdfDocumentHandle | null,
        abortSignal?: AbortSignal
    ): Promise<SearchMatch[]> {
        if (!query.trim()) return [];
        const lowerQuery = query.toLowerCase();
        
        if (bookContent.type === 'fixed') {
            return this.searchFixed(lowerQuery, bookContent, pdfHandle, abortSignal);
        } else {
            return this.searchReflowable(lowerQuery, bookContent, abortSignal);
        }
    }

    private async searchFixed(query: string, _bookContent: DocumentContent, pdfHandle?: PdfDocumentHandle | null, abortSignal?: AbortSignal): Promise<SearchMatch[]> {
        if (!pdfHandle) return [];
        
        const matches: SearchMatch[] = [];
        const pageCount = pdfHandle.getPageCount();
        
        for (let i = 0; i < pageCount; i++) {
            if (abortSignal?.aborted) break;
            
            try {
                const page = await pdfHandle.getPage(i);
                const textContent = await page.getTextContent();
                
                let fullText = '';
                const itemIndices: { textItemIndex: number, startChar: number, endChar: number }[] = [];
                
                for (let j = 0; j < textContent.items.length; j++) {
                    const item = textContent.items[j] as any;
                    const startChar = fullText.length;
                    const str = item.text || '';
                    fullText += str;
                    
                    itemIndices.push({ textItemIndex: j, startChar, endChar: fullText.length });
                    
                    if (item.hasEOL) {
                        fullText += '\n';
                    } else if (j < textContent.items.length - 1) {
                        const nextItem = textContent.items[j + 1] as any;
                        const nextStr = nextItem.text || '';
                        
                        const strEndsWithSpace = str.length > 0 && str[str.length - 1].trim() === '';
                        const nextStartsWithSpace = nextStr.length > 0 && nextStr[0].trim() === '';
                        
                        if (!strEndsWithSpace && !nextStartsWithSpace) {
                            const gap = nextItem.x - (item.x + item.width);
                            if (Math.abs(item.y - nextItem.y) > item.height * 0.5) {
                                fullText += '\n';
                            } else if (gap > item.height * 0.25) {
                                fullText += ' ';
                            }
                        }
                    }
                }
                
                const lowerText = fullText.toLowerCase();
                let startIndex = 0;
                
                while (startIndex < lowerText.length) {
                    if (abortSignal?.aborted) break;
                    const matchIndex = lowerText.indexOf(query, startIndex);
                    if (matchIndex === -1) break;
                    
                    const matchEnd = matchIndex + query.length;
                    
                    const spanningItems = itemIndices
                        .filter(idx => matchIndex < idx.endChar && matchEnd > idx.startChar)
                        .map(idx => {
                            const offsetInItem = Math.max(0, matchIndex - idx.startChar);
                            const endInItem = Math.min(idx.endChar - idx.startChar, matchEnd - idx.startChar);
                            return {
                                itemIndex: idx.textItemIndex,
                                textOffset: offsetInItem,
                                textLength: endInItem - offsetInItem
                            };
                        });
                    
                    const snippetStart = Math.max(0, matchIndex - 20);
                    const snippetEnd = Math.min(fullText.length, matchEnd + 20);
                    const snippet = fullText.substring(snippetStart, snippetEnd).replace(/\n/g, ' ');
                    
                    matches.push({
                        id: `pdf-${i}-${matchIndex}`,
                        pageOrChapterIndex: i,
                        snippet,
                        matchQuery: query,
                        pdfMatchRects: spanningItems
                    });
                    
                    startIndex = matchIndex + 1;
                }
            } catch (e) {
                console.warn('Failed to search page', i, e);
            }
        }
        
        return matches;
    }

    private async searchReflowable(query: string, bookContent: Book, abortSignal?: AbortSignal): Promise<SearchMatch[]> {
        const matches: SearchMatch[] = [];
        
        const chapters = bookContent.chapters || [];
        for (let i = 0; i < chapters.length; i++) {
            if (abortSignal?.aborted) break;
            const chapter = chapters[i];
            
            for (const block of chapter.blocks) {
                if (abortSignal?.aborted) break;
                if (block.type === 'paragraph' || block.type === 'heading') {
                    let fullText = '';
                    
                    const runs = (block as any).runs || [];
                    for (let j = 0; j < runs.length; j++) {
                        const run = runs[j];
                        fullText += run.text;
                    }
                    
                    const lowerText = fullText.toLowerCase();
                    let startIndex = 0;
                    
                    while (startIndex < lowerText.length) {
                        const matchIndex = lowerText.indexOf(query, startIndex);
                        if (matchIndex === -1) break;
                        
                        const matchEnd = matchIndex + query.length;
                        
                        const snippetStart = Math.max(0, matchIndex - 20);
                        const snippetEnd = Math.min(fullText.length, matchEnd + 20);
                        const snippet = fullText.substring(snippetStart, snippetEnd);
                        
                        matches.push({
                            id: `epub-${i}-${block.id}-${matchIndex}`,
                            pageOrChapterIndex: i,
                            snippet,
                            matchQuery: query,
                            reflowableBlockId: block.id
                        });
                        
                        startIndex = matchIndex + 1;
                    }
                }
            }
        }
        
        return matches;
    }
}
