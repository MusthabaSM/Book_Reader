import { parseXhtml, resolveRelativePath } from './utils';
import type { 
    Block, ParagraphBlock, HeadingBlock, ImageBlock, 
    TextRun, CodeBlock, QuoteBlock, ListBlock, 
    HorizontalRuleBlock, ListItem 
} from '../../../book/models';

export class XhtmlParser {
    private basePath: string;
    private chapterId: string;
    private idCounter = 0;

    constructor(basePath: string, chapterId: string) {
        this.basePath = basePath;
        this.chapterId = chapterId;
    }

    private nextId(): string {
        return `${this.chapterId}-b${this.idCounter++}`;
    }

    public parse(html: string): Block[] {
        const doc = parseXhtml(html);
        const body = doc.getElementsByTagName('body')[0] || doc.documentElement;
        return this.parseContainer(body);
    }

    private parseContainer(node: Node): Block[] {
        const blocks: Block[] = [];
        
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            
            if (child.nodeType === 1) { // Element node
                const el = child as Element;
                const tagName = el.localName?.toLowerCase() || el.nodeName?.toLowerCase();
                
                // Security: Strip unsafe tags completely
                if (['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta'].includes(tagName)) {
                    continue;
                }

                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    blocks.push(this.parseHeading(el, parseInt(tagName[1], 10) as any));
                } else if (['p', 'div', 'section', 'article'].includes(tagName)) {
                    if (this.hasBlockChildren(el)) {
                        blocks.push(...this.parseContainer(el));
                    } else {
                        const runs = this.parseInline(el);
                        if (runs.length > 0) {
                            blocks.push({
                                id: this.nextId(),
                                type: 'paragraph',
                                runs
                            } as ParagraphBlock);
                        }
                    }
                } else if (tagName === 'blockquote') {
                    blocks.push({
                        id: this.nextId(),
                        type: 'quote',
                        blocks: this.parseContainer(el)
                    } as QuoteBlock);
                } else if (tagName === 'pre' || tagName === 'code') {
                    if (this.hasBlockChildren(el)) {
                        blocks.push(...this.parseContainer(el));
                    } else {
                        blocks.push({
                            id: this.nextId(),
                            type: 'code',
                            code: el.textContent || ''
                        } as CodeBlock);
                    }
                } else if (tagName === 'ul' || tagName === 'ol') {
                    const items: ListItem[] = [];
                    for (let j = 0; j < el.childNodes.length; j++) {
                        const li = el.childNodes[j];
                        if (li.nodeType === 1 && (li as Element).localName?.toLowerCase() === 'li') {
                            if (this.hasBlockChildren(li as Element)) {
                                items.push({ runs: [], blocks: this.parseContainer(li) });
                            } else {
                                items.push({ runs: this.parseInline(li) });
                            }
                        }
                    }
                    blocks.push({
                        id: this.nextId(),
                        type: 'list',
                        ordered: tagName === 'ol',
                        items
                    } as ListBlock);
                } else if (tagName === 'hr') {
                    blocks.push({
                        id: this.nextId(),
                        type: 'horizontal-rule'
                    } as HorizontalRuleBlock);
                } else if (tagName === 'img' || tagName === 'figure') {
                    const img = tagName === 'img' ? el : el.getElementsByTagName('img')[0];
                    if (img) {
                        const src = img.getAttribute('src');
                        if (src) {
                            blocks.push({
                                id: this.nextId(),
                                type: 'image',
                                resourceId: resolveRelativePath(this.basePath, src)
                            } as ImageBlock);
                        }
                    }
                } else {
                    // Unknown elements are treated as inline wrappers inside a paragraph if they have content
                    const runs = this.parseInline(el);
                    if (runs.length > 0) {
                        blocks.push({
                            id: this.nextId(),
                            type: 'paragraph',
                            runs
                        } as ParagraphBlock);
                    }
                }
            } else if (child.nodeType === 3) { // Text node
                const text = child.textContent;
                // Avoid creating empty paragraph blocks for purely whitespace text nodes between elements
                if (text && text.trim().length > 0) {
                    blocks.push({
                        id: this.nextId(),
                        type: 'paragraph',
                        runs: [{ text: text.replace(/\s+/g, ' ') }]
                    } as ParagraphBlock);
                }
            }
        }
        
        return blocks;
    }

    private hasBlockChildren(el: Element): boolean {
        const blockTags = ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'hr', 'img', 'figure', 'table'];
        for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i];
            if (child.nodeType === 1) {
                const tagName = (child as Element).localName?.toLowerCase() || (child as Element).nodeName?.toLowerCase();
                if (blockTags.includes(tagName)) {
                    return true;
                }
            }
        }
        return false;
    }

    private parseHeading(el: Element, level: 1|2|3|4|5|6): HeadingBlock {
        return {
            id: this.nextId(),
            type: 'heading',
            level,
            runs: this.parseInline(el)
        };
    }

    private parseInline(node: Node, currentFormat: Partial<TextRun> = {}): TextRun[] {
        const runs: TextRun[] = [];

        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            
            if (child.nodeType === 3) { // Text
                const text = child.textContent;
                if (text && text.trim().length > 0) {
                    runs.push({ ...currentFormat, text: text.replace(/\s+/g, ' ') });
                } else if (text && text.length > 0) {
                    // It's entirely whitespace but exists inline, preserve a single space
                    runs.push({ ...currentFormat, text: ' ' });
                }
            } else if (child.nodeType === 1) { // Element
                const el = child as Element;
                const tagName = el.localName?.toLowerCase() || el.nodeName?.toLowerCase();
                
                // Security: Ignore script, object etc
                if (['script', 'iframe', 'object', 'embed', 'style'].includes(tagName)) continue;
                
                const newFormat = { ...currentFormat };
                
                if (['b', 'strong'].includes(tagName)) newFormat.bold = true;
                if (['i', 'em'].includes(tagName)) newFormat.italic = true;
                if (['u'].includes(tagName)) newFormat.underline = true;
                if (['s', 'strike', 'del'].includes(tagName)) newFormat.strikethrough = true;
                if (['sup'].includes(tagName)) newFormat.superscript = true;
                if (['sub'].includes(tagName)) newFormat.subscript = true;
                if (['code'].includes(tagName)) newFormat.code = true;
                
                if (tagName === 'a') {
                    const href = el.getAttribute('href');
                    if (href) newFormat.linkUrl = href;
                }
                
                if (tagName === 'br') {
                    // For br, we'll insert a fake text run with a newline, or rely on a new block.
                    // Let's insert a space for now, or just let it break line naturally in layout?
                    // The layout engine doesn't currently support '\n' inside TextRun elegantly except via splitting.
                    // For now, treat it as space.
                    runs.push({ ...currentFormat, text: ' ' });
                } else {
                    runs.push(...this.parseInline(child, newFormat));
                }
            }
        }

        return this.mergeRuns(runs);
    }

    private mergeRuns(runs: TextRun[]): TextRun[] {
        if (runs.length <= 1) return runs;
        const merged: TextRun[] = [];
        let current = runs[0];
        
        for (let i = 1; i < runs.length; i++) {
            const next = runs[i];
            const sameFormat = 
                current.bold === next.bold &&
                current.italic === next.italic &&
                current.underline === next.underline &&
                current.strikethrough === next.strikethrough &&
                current.superscript === next.superscript &&
                current.subscript === next.subscript &&
                current.code === next.code &&
                current.linkUrl === next.linkUrl;
                
            if (sameFormat) {
                current = { ...current, text: current.text + next.text };
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        
        // Remove completely empty runs that can sometimes get left over
        return merged.filter(r => r.text.length > 0);
    }
}
