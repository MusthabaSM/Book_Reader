export interface PaginationConfig {
    pageWidth: number;
    pageHeight: number;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    fontFamily: string;
    baseFontSize: number;
    lineHeight: number;
    paragraphSpacing: number;
    headingSpacing: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    forceSinglePage?: boolean;
    rotation?: number;
}

export const defaultPaginationConfig: PaginationConfig = {
    pageWidth: 800,
    pageHeight: 1200,
    marginTop: 80,
    marginBottom: 80,
    marginLeft: 60,
    marginRight: 60,
    fontFamily: 'serif',
    baseFontSize: 16,
    lineHeight: 1.5,
    paragraphSpacing: 16,
    headingSpacing: 24,
    textAlign: 'left',
    forceSinglePage: false
};

export function getAvailableWidth(config: PaginationConfig): number {
    return config.pageWidth - config.marginLeft - config.marginRight;
}

export function getAvailableHeight(config: PaginationConfig): number {
    return config.pageHeight - config.marginTop - config.marginBottom;
}
