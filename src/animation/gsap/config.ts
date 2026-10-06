export type PageTurnDirection = 'forward' | 'backward';

export interface PageTurnConfig {
    duration: number;
    easing: string;
    perspective: number;
    shadowIntensity: number;
}

export const defaultPageTurnConfig: PageTurnConfig = {
    duration: 0.8,
    easing: 'power2.inOut',
    perspective: 2000,
    shadowIntensity: 0.3
};
