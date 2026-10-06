export interface TextMetrics {
    width: number;
    height: number;
}

export interface TextMeasurer {
    measureText(text: string, fontFamily: string, fontSize: number, bold?: boolean, italic?: boolean): TextMetrics;
}

/**
 * A simple deterministic text measurer suitable for unit tests and initial architecture.
 * Approximates character widths based on font size.
 */
export class MockTextMeasurer implements TextMeasurer {
    public measureText(text: string, _fontFamily: string, fontSize: number, _bold?: boolean, _italic?: boolean): TextMetrics {
        // Simple approximation: average char width is ~0.6 of fontSize
        const charWidth = fontSize * 0.6;
        const width = text.length * charWidth;
        const height = fontSize * 1.2; // approx line height factor
        
        return {
            width,
            height
        };
    }
}
