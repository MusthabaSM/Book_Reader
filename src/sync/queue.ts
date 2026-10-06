export type SyncOperationType = 'UPSERT_BOOK' | 'DELETE_BOOK' | 'UPSERT_SHELVES';

export interface SyncOperation {
    id: string; // uuid
    type: SyncOperationType;
    payload: any;
    timestamp: number;
    retryCount: number;
}

const QUEUE_KEY = 'ohara_sync_queue';

export class SyncQueue {
    public getQueue(): SyncOperation[] {
        try {
            const data = localStorage.getItem(QUEUE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    private saveQueue(queue: SyncOperation[]) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }

    public enqueue(type: SyncOperationType, payload: any) {
        const queue = this.getQueue();
        
        // Basic deduplication: if we're upserting the same book, replace the older operation
        if (type === 'UPSERT_BOOK') {
            const existingIndex = queue.findIndex(op => op.type === type && op.payload.id === payload.id);
            if (existingIndex >= 0) {
                queue[existingIndex].payload = payload;
                queue[existingIndex].timestamp = Date.now();
                this.saveQueue(queue);
                return;
            }
        } else if (type === 'UPSERT_SHELVES') {
            const existingIndex = queue.findIndex(op => op.type === type);
            if (existingIndex >= 0) {
                queue[existingIndex].payload = payload;
                queue[existingIndex].timestamp = Date.now();
                this.saveQueue(queue);
                return;
            }
        }

        queue.push({
            id: crypto.randomUUID(),
            type,
            payload,
            timestamp: Date.now(),
            retryCount: 0
        });
        
        this.saveQueue(queue);
    }

    public remove(id: string) {
        const queue = this.getQueue();
        this.saveQueue(queue.filter(op => op.id !== id));
    }

    public incrementRetry(id: string) {
        const queue = this.getQueue();
        const op = queue.find(o => o.id === id);
        if (op) {
            op.retryCount += 1;
            this.saveQueue(queue);
        }
    }
}
