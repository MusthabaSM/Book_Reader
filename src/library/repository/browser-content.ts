import type { BookContentRepository } from './index';
import type { DocumentContent } from '../../book/models';
import { get, set, del } from 'idb-keyval';

export class BrowserBookContentRepository implements BookContentRepository {
    async store(document: DocumentContent): Promise<void> {
        await set(`content_${document.id}`, document);
    }

    async get(bookId: string): Promise<DocumentContent | null> {
        const content = await get(`content_${bookId}`);
        return content || null;
    }

    async delete(bookId: string): Promise<void> {
        await del(`content_${bookId}`);
    }
}
