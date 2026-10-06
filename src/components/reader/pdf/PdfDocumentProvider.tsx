import { createContext, useContext, useEffect, useState } from 'react';
import type { PdfDocumentHandle } from '../../../formats/pdf/engine';
import type { DocumentSource } from '../../../library/repository';
import { PdfRenderCache } from './PdfRenderCache';

interface PdfDocumentContextValue {
    documentHandle: PdfDocumentHandle | null;
    isLoading: boolean;
    error: string | null;
    documentSourceId: string | null;
}

const PdfDocumentContext = createContext<PdfDocumentContextValue>({
    documentHandle: null,
    isLoading: false,
    error: null,
    documentSourceId: null
});

export const usePdfDocument = () => useContext(PdfDocumentContext);

interface Props {
    documentSourceId: string;
    resolveDocumentSource: (id: string) => Promise<DocumentSource>;
    children: React.ReactNode;
}

export const PdfDocumentProvider: React.FC<Props> = ({ documentSourceId, resolveDocumentSource, children }) => {
    const [documentHandle, setDocumentHandle] = useState<PdfDocumentHandle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let currentHandle: PdfDocumentHandle | null = null;
        let isCancelled = false;

        const loadDoc = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                const source = await resolveDocumentSource(documentSourceId);
                if (isCancelled) return;
                
                const { PdfEngine } = await import('../../../formats/pdf/engine');
                currentHandle = await PdfEngine.loadDocument(source);
                if (isCancelled) {
                    await currentHandle.destroy();
                    return;
                }
                
                setDocumentHandle(currentHandle);
            } catch (err: any) {
                if (!isCancelled) {
                    setError(err.message || 'Failed to load PDF');
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
                PdfRenderCache.clearDocument(documentSourceId);
            }
        };
    }, [documentSourceId, resolveDocumentSource]);

    return (
        <PdfDocumentContext.Provider value={{ documentHandle, isLoading, error, documentSourceId }}>
            {children}
        </PdfDocumentContext.Provider>
    );
};
