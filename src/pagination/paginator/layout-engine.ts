import type { Block, ParagraphBlock, HeadingBlock, ImageBlock, CodeBlock } from '../../book/models';
import type { PaginationConfig } from '../layout/config';
import type { TextMeasurer } from '../layout/measurer';
import type { TextElement, ImageElement, CodeElement, RuleElement, PageElement } from '../page-model';
import { breakParagraphIntoLines } from './line-breaker';

export interface LayoutContext {
    bookId: string;
    chapterId: string;
    config: PaginationConfig;
    measurer: TextMeasurer;
    availableWidth: number;
}

export interface BlockLayoutResult {
    elements: PageElement[];
    totalHeight: number;
    canSplit: boolean;
}

export class BlockLayoutEngine {
    public layoutBlock(block: Block, context: LayoutContext): BlockLayoutResult {
        switch (block.type) {
            case 'paragraph':
                return this.layoutParagraph(block as ParagraphBlock, context);
            case 'heading':
                return this.layoutHeading(block as HeadingBlock, context);
            case 'image':
                return this.layoutImage(block as ImageBlock, context);
            case 'code':
                return this.layoutCode(block as CodeBlock, context);
            case 'horizontal-rule':
                return this.layoutHorizontalRule(block, context);
            case 'page-break':
                return { elements: [], totalHeight: 0, canSplit: false };
            case 'list':
            case 'table':
            case 'quote':
                return this.layoutPlaceholder(block, context);
            default:
                return { elements: [], totalHeight: 0, canSplit: false };
        }
    }

    private layoutParagraph(block: ParagraphBlock, context: LayoutContext): BlockLayoutResult {
        const lines = breakParagraphIntoLines(block.runs, context.availableWidth, context.measurer, context.config.fontFamily, context.config.baseFontSize);
        
        let yOffset = 0;
        const elements: TextElement[] = [];

        for (const line of lines) {
            let xOffset = 0;
            if (context.config.textAlign === 'center') {
                xOffset = (context.availableWidth - line.width) / 2;
            } else if (context.config.textAlign === 'right') {
                xOffset = context.availableWidth - line.width;
            }

            for (const frag of line.fragments) {
                elements.push({
                    id: `${block.id}-frag-${frag.inlineStart}`,
                    type: 'text',
                    text: frag.text,
                    fontFamily: context.config.fontFamily,
                    fontSize: context.config.baseFontSize,
                    bold: frag.run.bold,
                    italic: frag.run.italic,
                    underline: frag.run.underline,
                    geometry: { x: xOffset, y: yOffset, width: frag.width, height: frag.height },
                    sourceBlockId: block.id,
                    sourceChapterId: context.chapterId,
                    sourceInlineStart: frag.inlineStart,
                    sourceInlineEnd: frag.inlineEnd
                });
                xOffset += frag.width;
            }
            yOffset += (context.config.baseFontSize * context.config.lineHeight);
        }

        return {
            elements,
            totalHeight: yOffset + context.config.paragraphSpacing,
            canSplit: true 
        };
    }

    private layoutHeading(block: HeadingBlock, context: LayoutContext): BlockLayoutResult {
        const scaleMap: Record<number, number> = { 1: 2.5, 2: 2.0, 3: 1.75, 4: 1.5, 5: 1.25, 6: 1.0 };
        const scale = scaleMap[block.level] || 1.0;
        const fontSize = context.config.baseFontSize * scale;

        const lines = breakParagraphIntoLines(block.runs, context.availableWidth, context.measurer, context.config.fontFamily, fontSize, true);
        
        let yOffset = context.config.headingSpacing; 
        const elements: TextElement[] = [];

        for (const line of lines) {
            let xOffset = 0;
            for (const frag of line.fragments) {
                elements.push({
                    id: `${block.id}-frag-${frag.inlineStart}`,
                    type: 'text',
                    text: frag.text,
                    fontFamily: context.config.fontFamily,
                    fontSize: fontSize,
                    bold: true,
                    italic: frag.run.italic,
                    underline: frag.run.underline,
                    geometry: { x: xOffset, y: yOffset, width: frag.width, height: frag.height },
                    sourceBlockId: block.id,
                    sourceChapterId: context.chapterId,
                    sourceInlineStart: frag.inlineStart,
                    sourceInlineEnd: frag.inlineEnd
                });
                xOffset += frag.width;
            }
            yOffset += (fontSize * context.config.lineHeight);
        }

        return {
            elements,
            totalHeight: yOffset + context.config.headingSpacing,
            canSplit: false
        };
    }

    private layoutImage(block: ImageBlock, context: LayoutContext): BlockLayoutResult {
        const width = context.availableWidth;
        const height = width * 0.5625; // 16:9 intrinsic aspect ratio fallback

        const element: ImageElement = {
            id: `${block.id}-img`,
            type: 'image',
            resourceId: block.resourceId,
            geometry: { x: 0, y: 0, width, height },
            sourceBlockId: block.id,
            sourceChapterId: context.chapterId
        };

        return {
            elements: [element],
            totalHeight: height + context.config.paragraphSpacing,
            canSplit: false
        };
    }

    private layoutCode(block: CodeBlock, context: LayoutContext): BlockLayoutResult {
        const lines = block.code.split('\n');
        const fontSize = context.config.baseFontSize * 0.9;
        const lineHeight = fontSize * 1.5;
        const totalHeight = lines.length * lineHeight;

        const element: CodeElement = {
            id: `${block.id}-code`,
            type: 'code',
            codeLines: lines,
            fontFamily: 'monospace',
            fontSize: fontSize,
            geometry: { x: 0, y: 0, width: context.availableWidth, height: totalHeight },
            sourceBlockId: block.id,
            sourceChapterId: context.chapterId
        };

        return {
            elements: [element],
            totalHeight: totalHeight + context.config.paragraphSpacing,
            canSplit: false
        };
    }

    private layoutHorizontalRule(block: Block, context: LayoutContext): BlockLayoutResult {
        const element: RuleElement = {
            id: `${block.id}-hr`,
            type: 'rule',
            geometry: { x: 0, y: 0, width: context.availableWidth, height: 2 },
            sourceBlockId: block.id,
            sourceChapterId: context.chapterId
        };
        return {
            elements: [element],
            totalHeight: 20 + context.config.paragraphSpacing,
            canSplit: false
        };
    }

    private layoutPlaceholder(block: Block, context: LayoutContext): BlockLayoutResult {
        const text = `[Unsupported Block: ${block.type}]`;
        const metrics = context.measurer.measureText(text, context.config.fontFamily, context.config.baseFontSize);
        
        const element: TextElement = {
            id: `${block.id}-fallback`,
            type: 'text',
            text,
            fontFamily: context.config.fontFamily,
            fontSize: context.config.baseFontSize,
            geometry: { x: 0, y: 0, width: metrics.width, height: metrics.height },
            sourceBlockId: block.id,
            sourceChapterId: context.chapterId
        };

        return {
            elements: [element],
            totalHeight: metrics.height + context.config.paragraphSpacing,
            canSplit: false
        };
    }
}
