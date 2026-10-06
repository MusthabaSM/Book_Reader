import React from 'react';

interface Props {
    children: React.ReactNode;
    zoomLevel: number;
    baseWidth: number;
    baseHeight: number;
}

export const ReaderViewport: React.FC<Props> = ({ children, zoomLevel, baseWidth, baseHeight }) => {
    return (
        <div style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent'
        }}>
            <div style={{
                width: `${baseWidth * zoomLevel}px`,
                height: `${baseHeight * zoomLevel}px`,
                position: 'relative',
                flexShrink: 0
            }}>
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${baseWidth}px`,
                    height: `${baseHeight}px`,
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'top left',
                    transition: 'transform 0.2s ease-out'
                }}>
                    {children}
                </div>
            </div>
        </div>
    );
};
