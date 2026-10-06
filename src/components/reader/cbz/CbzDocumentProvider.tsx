import React, { createContext, useContext, useEffect, useState } from 'react';
import type { CbzDocumentHandle, CompositeCbzDocumentHandle } from '../../../formats/cbz/engine';
import type { DocumentSource } from '../../../library/repository';

interface CbzDocumentContextValue {
    documentHandle: CbzDocumentHandle | CompositeCbzDocumentHandle | null;
    isLoading: boolean;
    error: string | null;
    documentSourceId: string | null;
}

const CbzDocumentContext = createContext<CbzDocumentContextValue>({
    documentHandle: null,
    isLoading: false,
    error: null,
    documentSourceId: null
});

export const useCbzDocument = () => useContext(CbzDocumentContext);

interface Props {
    documentSourceId: string;
    resolveDocumentSource: (id: string) => Promise<DocumentSource>;
    children: React.ReactNode;
}

export const CbzDocumentProvider: React.FC<Props> = ({ documentSourceId, resolveDocumentSource, children }) => {
    const [documentHandle, setDocumentHandle] = useState<CbzDocumentHandle | CompositeCbzDocumentHandle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let currentHandle: CbzDocumentHandle | CompositeCbzDocumentHandle | null = null;
        let isCancelled = false;

        const loadDoc = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                const { CbzEngine } = await import('../../../formats/cbz/engine');
                
                if (documentSourceId.startsWith('MULTI:')) {
                    const ids = documentSourceId.substring(6).split(',');
                    const sources = await Promise.all(ids.map(id => resolveDocumentSource(id)));
                    if (isCancelled) return;
                    currentHandle = await CbzEngine.loadDocument(sources);
                } else {
                    const source = await resolveDocumentSource(documentSourceId);
                    if (isCancelled) return;
                    currentHandle = await CbzEngine.loadDocument(source);
                }
                
                if (isCancelled) {
                    if (currentHandle) {
                        await currentHandle.destroy();
                    }
                    return;
                }
                
                setDocumentHandle(currentHandle);
            } catch (err: any) {
                if (!isCancelled) {
                    setError(err.message || 'Failed to load CBZ');
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadDoc();

        return () => {
            isCancelled = true;
            if (currentHandle) {
                currentHandle.destroy().catch(console.error);
            }
        };
    }, [documentSourceId, resolveDocumentSource]);

    return (
        <CbzDocumentContext.Provider value={{ documentHandle, isLoading, error, documentSourceId }}>
            {children}
        </CbzDocumentContext.Provider>
    );
};
