import React, { useEffect } from 'react';
import { usePdfDocument } from './pdf/PdfDocumentProvider';
import { SearchService } from '../../reader/search';
import type { DocumentContent } from '../../book/models';

interface Props {
    searchQuery: string | null;
    bookContent?: DocumentContent;
    onResults: (results: any[]) => void;
    onSearchComplete: () => void;
}

const searchService = new SearchService();

export const SearchExecutor: React.FC<Props> = ({ searchQuery, bookContent, onResults, onSearchComplete }) => {
    const { documentHandle } = usePdfDocument();

    useEffect(() => {
        if (!bookContent) return;

        if (!searchQuery) {
            onResults([]);
            onSearchComplete();
            return;
        }

        const abortController = new AbortController();
        let isCancelled = false;

        const executeSearch = async () => {
            try {
                const results = await searchService.search(
                    searchQuery, 
                    bookContent, 
                    bookContent.type === 'fixed' ? (documentHandle as any) : null,
                    abortController.signal
                );
                
                if (!isCancelled) {
                    onResults(results);
                }
            } catch (e) {
                console.error("Search failed:", e);
                if (!isCancelled) {
                    onResults([]);
                }
            } finally {
                if (!isCancelled) {
                    onSearchComplete();
                }
            }
        };

        executeSearch();

        return () => {
            isCancelled = true;
            abortController.abort();
        };
    }, [searchQuery, bookContent, documentHandle, onResults, onSearchComplete]);

    return null; // This is a logic-only component
};
