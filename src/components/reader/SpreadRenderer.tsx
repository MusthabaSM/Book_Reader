import React from 'react';
import type { Spread } from '../../pagination/page-model';
import type { PaginationConfig } from '../../pagination/layout/config';
import { PageRendererResolver } from './PageRendererResolver';
import { getPresentationPageWidth, getPresentationPageHeight } from './page-geometry';

interface Props {
    spread: Spread;
    config: PaginationConfig;
    zoomLevel?: number;
}

export const SpreadRenderer: React.FC<Props> = ({ spread, config, zoomLevel = 1.0 }) => {
    const leftWidth = getPresentationPageWidth(spread.leftPage, config);
    const leftHeight = getPresentationPageHeight(spread.leftPage, config);
    const rightWidth = getPresentationPageWidth(spread.rightPage, config);
    const rightHeight = getPresentationPageHeight(spread.rightPage, config);

    const spreadWidth = leftWidth + rightWidth;
    const maxHeight = Math.max(leftHeight, rightHeight);

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            width: `${spreadWidth}px`, 
            height: `${maxHeight}px`,
            position: 'relative'
        }}>
            <div style={{ width: `${leftWidth}px`, height: `${maxHeight}px`, position: 'relative' }}>
                {spread.leftPage ? (
                    <PageRendererResolver page={spread.leftPage} config={config} zoomLevel={zoomLevel} />
                ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />
                )}
            </div>

            <div style={{
                position: 'absolute',
                left: `${leftWidth}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                backgroundColor: '#ddd',
                zIndex: 10
            }} />

            <div style={{ width: `${rightWidth}px`, height: `${maxHeight}px`, position: 'relative' }}>
                {spread.rightPage ? (
                    <PageRendererResolver page={spread.rightPage} config={config} zoomLevel={zoomLevel} />
                ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0' }} />
                )}
            </div>
        </div>
    );
};
