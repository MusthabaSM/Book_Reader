import type { TextMeasurer } from '../layout/measurer';
import type { TextRun } from '../../book/models';

export interface LineFragment {
    text: string;
    width: number;
    height: number;
    run: TextRun;
    inlineStart: number;
    inlineEnd: number;
}

export interface Line {
    fragments: LineFragment[];
    width: number;
    height: number;
}

export function breakParagraphIntoLines(
    runs: TextRun[],
    availableWidth: number,
    measurer: TextMeasurer,
    fontFamily: string,
    fontSize: number,
    defaultBold?: boolean
): Line[] {
    const lines: Line[] = [];
    let currentLineFragments: LineFragment[] = [];
    let currentLineWidth = 0;
    let currentLineHeight = 0;

    let globalInlineOffset = 0;

    for (const run of runs) {
        // Basic word wrap
        const words = run.text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const isLastWord = i === words.length - 1;
            const textToMeasure = isLastWord ? word : word + ' ';
            
            if (textToMeasure === '') {
                continue;
            }

            const isBold = defaultBold !== undefined ? defaultBold : run.bold;
            const metrics = measurer.measureText(textToMeasure, fontFamily, fontSize, isBold, run.italic);
            
            if (currentLineWidth + metrics.width > availableWidth && currentLineWidth > 0) {
                // Wrap to next line
                lines.push({
                    fragments: currentLineFragments,
                    width: currentLineWidth,
                    height: currentLineHeight
                });
                currentLineFragments = [];
                currentLineWidth = 0;
                currentLineHeight = 0;
            }
            
            const fragment: LineFragment = {
                text: textToMeasure,
                width: metrics.width,
                height: metrics.height,
                run,
                inlineStart: globalInlineOffset,
                inlineEnd: globalInlineOffset + textToMeasure.length
            };

            currentLineFragments.push(fragment);
            currentLineWidth += metrics.width;
            currentLineHeight = Math.max(currentLineHeight, metrics.height);
            
            globalInlineOffset += textToMeasure.length;
        }
    }
    
    if (currentLineFragments.length > 0) {
        lines.push({
            fragments: currentLineFragments,
            width: currentLineWidth,
            height: currentLineHeight
        });
    }

    return lines;
}
