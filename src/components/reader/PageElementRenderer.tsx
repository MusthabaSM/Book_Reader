import React from 'react';
import type { PageElement, TextElement, ImageElement, CodeElement } from '../../pagination/page-model';
import { useResources } from './ResourceContext';
import type { SearchMatch } from '../../reader/search';

interface Props {
    element: PageElement;
    searchMatch?: SearchMatch;
}

export const PageElementRenderer: React.FC<Props> = ({ element, searchMatch }) => {
    const { resources } = useResources();

    const baseStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${element.geometry.x}px`,
        top: `${element.geometry.y}px`,
        width: `${element.geometry.width}px`,
        height: `${element.geometry.height}px`
    };

    switch (element.type) {
        case 'text': {
            const textEl = element as TextElement;
            const style: React.CSSProperties = {
                ...baseStyle,
                fontFamily: textEl.fontFamily,
                fontSize: `${textEl.fontSize}px`,
                fontWeight: textEl.bold ? 'bold' : 'normal',
                fontStyle: textEl.italic ? 'italic' : 'normal',
                textDecoration: textEl.underline ? 'underline' : 'none',
                color: textEl.color || 'inherit',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
                overflow: 'visible'
            };
            
            let content: React.ReactNode = textEl.text;
            
            if (searchMatch && searchMatch.reflowableBlockId === textEl.sourceBlockId && searchMatch.matchQuery) {
                const lowerText = textEl.text.toLowerCase();
                const lowerQuery = searchMatch.matchQuery.toLowerCase();
                
                // For a multi-word search that spans elements, this naive indexOf might miss parts.
                // But for simple word searches, it correctly highlights just the word.
                const idx = lowerText.indexOf(lowerQuery);
                
                if (idx !== -1) {
                    content = (
                        <>
                            {textEl.text.substring(0, idx)}
                            <span style={{ backgroundColor: 'rgba(255, 255, 0, 0.4)' }}>{textEl.text.substring(idx, idx + lowerQuery.length)}</span>
                            {textEl.text.substring(idx + lowerQuery.length)}
                        </>
                    );
                }
            }
            
            return <div style={style} data-block-id={textEl.sourceBlockId}>{content}</div>;
        }
        case 'image': {
            const imgEl = element as ImageElement;
            const resource = resources[imgEl.resourceId];
            
            if (resource && resource.url) {
                return (
                    <img 
                        src={resource.url} 
                        alt={resource.altText || ''}
                        style={{ ...baseStyle, objectFit: 'contain' }} 
                        data-block-id={imgEl.sourceBlockId}
                    />
                );
            }

            return (
                <div style={{ ...baseStyle, backgroundColor: '#eee', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-block-id={imgEl.sourceBlockId}>
                    <span style={{ color: '#888', fontSize: '12px' }}>[Image Placeholder: {imgEl.resourceId}]</span>
                </div>
            );
        }
        case 'rule': {
            return <div style={{ ...baseStyle, borderBottom: '2px solid currentColor' }} data-block-id={element.sourceBlockId} />;
        }
        case 'code': {
            const codeEl = element as CodeElement;
            return (
                <pre style={{ ...baseStyle, fontFamily: codeEl.fontFamily, fontSize: `${codeEl.fontSize}px`, backgroundColor: '#f5f5f5', padding: '4px', margin: 0, overflow: 'hidden' }} data-block-id={codeEl.sourceBlockId}>
                    {codeEl.codeLines.join('\n')}
                </pre>
            );
        }
        default:
            return (
                <div style={{ ...baseStyle, backgroundColor: '#ffebee', color: '#c62828', fontSize: '12px' }}>
                    [Unsupported Element: {(element as any).type}]
                </div>
            );
    }
};
