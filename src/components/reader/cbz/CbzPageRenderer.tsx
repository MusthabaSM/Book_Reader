import React, { useEffect, useState } from 'react';
import type { FixedPresentationPage } from '../../../pagination/page-model';
import { useCbzDocument } from './CbzDocumentProvider';

interface Props {
    page: FixedPresentationPage;
}

export const CbzPageRenderer: React.FC<Props> = ({ page }) => {
    const { documentHandle, isLoading: isDocLoading, error: docError } = useCbzDocument();
    
    const [imageUrl, setImageUrl] = useState<string | null>(() => {
        if (documentHandle) {
            return documentHandle.getCachedUrl(page.pageIndex);
        }
        return null;
    });
    
    const [renderError, setRenderError] = useState<string | null>(null);

    // Update imageUrl if page index changes while mounted (though this component usually remounts per page)
    useEffect(() => {
        if (documentHandle) {
            const cached = documentHandle.getCachedUrl(page.pageIndex);
            if (cached) {
                setImageUrl(cached);
            } else {
                setImageUrl(null);
            }
        }
    }, [page.pageIndex, documentHandle]);

    useEffect(() => {
        if (!documentHandle) return;

        let isCancelled = false;

        const loadPage = async () => {
            try {
                setRenderError(null);
                const pageHandle = await documentHandle.getPage(page.pageIndex);
                if (isCancelled) return;

                const url = await pageHandle.renderToBlobUrl();
                // If it was already set from cache synchronously, we can still update it if needed,
                // but usually the cache is authoritative.
                if (!isCancelled && url !== imageUrl) {
                    setImageUrl(url);
                }
            } catch (err: any) {
                if (!isCancelled) {
                    setRenderError(err.message || 'Failed to load page');
                }
            }
        };

        loadPage();

        return () => {
            isCancelled = true;
            // The blob URL will be cleaned up by the document handle on destroy,
            // but for fine-grained memory management we could release it here if we wanted.
            // However, releasing it here breaks rapid page turns or zooming where the component
            // remounts. We'll rely on the document handle's cleanup for now, or implement a bounded cache later.
        };
    }, [documentHandle, page.pageIndex]);

    if (docError) {
        return (
            <div style={{ width: `${page.width}px`, height: `${page.height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', color: 'red' }}>
                Document error: {docError}
            </div>
        );
    }

    if (isDocLoading) {
        return (
            <div style={{ width: `${page.width}px`, height: `${page.height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
                Loading document...
            </div>
        );
    }

    return (
        <div style={{ 
            width: `${page.width}px`, 
            height: `${page.height}px`, 
            position: 'relative', 
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {imageUrl ? (
                <img 
                    src={imageUrl} 
                    alt={`Page ${page.pageNumber}`}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        transform: `rotate(${page.rotation || 0}deg)`,
                        transformOrigin: 'center center'
                    }}
                    draggable={false}
                />
            ) : renderError ? (
                <div style={{ color: 'red' }}>{renderError}</div>
            ) : (
                <div>Loading image...</div>
            )}
        </div>
    );
};
