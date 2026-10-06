import type { BookContentRepository, BookContent } from './index';
import { get, set, del } from 'idb-keyval';

export class BrowserBookContentRepository implements BookContentRepository {
    async storeContent(id: string, content: BookContent): Promise<void> {
        await set(`content_${id}`, content);
    }

    async getContent(id: string): Promise<BookContent | null> {
        const content = await get(`content_${id}`);
        return content || null;
    }

    async deleteContent(id: string): Promise<void> {
        await del(`content_${id}`);
    }

    async updateProgress(id: string, progress: any): Promise<void> {
        const content = await this.getContent(id);
        if (content) {
            content.progress = progress;
            await this.storeContent(id, content);
        }
    }
}
