import React from 'react';
import type { PresentationPage, PageElement } from '../../pagination/page-model';
import { PageElementRenderer } from './PageElementRenderer';
import type { PaginationConfig } from '../../pagination/layout/config';
import type { SearchMatch } from '../../reader/search';

interface Props {
    page: PresentationPage;
    config: PaginationConfig;
    searchMatch?: SearchMatch;
}

export const PageRenderer: React.FC<Props> = ({ page, config, searchMatch }) => {
    if (page.type !== 'reflowable') {
        return <div>Fixed page placeholder</div>;
    }
    return (
        <div 
            style={{
                position: 'relative',
                width: `${config.pageWidth}px`,
                height: `${config.pageHeight}px`,
                backgroundColor: 'white',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                overflow: 'hidden'
            }}
            data-page-number={page.pageNumber}
        >
            <div style={{
                position: 'absolute',
                left: `${config.marginLeft}px`,
                top: `${config.marginTop}px`,
                width: `${config.pageWidth - config.marginLeft - config.marginRight}px`,
                height: `${config.pageHeight - config.marginTop - config.marginBottom}px`
            }}>
                {page.elements.map((el: PageElement) => (
                    <PageElementRenderer 
                        key={el.id} 
                        element={el} 
                        searchMatch={searchMatch?.reflowableBlockId === (el as any).sourceBlockId ? searchMatch : undefined}
                    />
                ))}
            </div>
            
            <div style={{
                position: 'absolute',
                bottom: '20px',
                width: '100%',
                textAlign: 'center',
                fontSize: '12px',
                color: '#888'
            }}>
                {page.pageNumber}
            </div>
        </div>
    );
};
