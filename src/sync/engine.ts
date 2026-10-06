import { supabase } from './supabase';
import { SyncQueue, type SyncOperation } from './queue';
import type { BookRepository } from '../library/repository';
import type { LibraryBook } from '../library/models';

export class SyncEngine {
    private queue: SyncQueue;
    private localRepo: BookRepository;
    private isSyncing: boolean = false;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    
    // Callback to notify the UI when sync state changes
    public onSyncStateChanged?: (syncing: boolean, error?: string) => void;

    constructor(localRepo: BookRepository) {
        this.localRepo = localRepo;
        this.queue = new SyncQueue();
    }

    public start() {
        if (this.syncInterval) return;
        
        // Initial sync on startup
        this.processQueue();
        this.pullRemoteChanges();
        
        // Periodic sync every 30 seconds
        this.syncInterval = setInterval(() => {
            this.processQueue();
            this.pullRemoteChanges();
        }, 30000);
        
        // Listen to online events
        window.addEventListener('online', () => {
            this.processQueue();
        });
    }

    public stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Enqueue a local mutation to be sent to Supabase
     */
    public enqueueBookUpsert(book: LibraryBook) {
        this.queue.enqueue('UPSERT_BOOK', book);
        this.processQueue();
    }

    public enqueueBookDelete(bookId: string) {
        this.queue.enqueue('DELETE_BOOK', bookId);
        this.processQueue();
    }
    
    public enqueueShelvesUpdate(shelves: string[]) {
        this.queue.enqueue('UPSERT_SHELVES', shelves);
        this.processQueue();
    }

    /**
     * Process the local outbox and push to Supabase
     */
    private async processQueue() {
        if (this.isSyncing) return;
        if (!navigator.onLine) return;

        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return; // Not logged in

        const items = this.queue.getQueue();
        if (items.length === 0) return;

        this.setSyncing(true);

        for (const item of items) {
            try {
                await this.pushOperation(item, session.session.user.id);
                this.queue.remove(item.id);
            } catch (error: any) {
                console.error('Sync push failed for operation', item, error);
                this.queue.incrementRetry(item.id);
                // Stop processing if we hit a network error to avoid hammering
                break;
            }
        }

        this.setSyncing(false);
    }

    private async pushOperation(op: SyncOperation, userId: string) {
        switch (op.type) {
            case 'UPSERT_BOOK': {
                const book = op.payload as LibraryBook;
                const { error } = await supabase.from('library_books').upsert({
                    id: book.id,
                    user_id: userId,
                    book_id: book.bookId,
                    title: book.title,
                    authors: book.authors,
                    genres: book.genres,
                    publication_year: book.publicationYear,
                    source_format: book.sourceFormat,
                    file_size_bytes: book.fileSizeBytes,
                    date_added: new Date(book.dateAdded).toISOString(),
                    date_last_opened: book.dateLastOpened ? new Date(book.dateLastOpened).toISOString() : null,
                    reading_progress: book.readingProgress,
                    is_favorite: book.isFavorite,
                    series_title: book.seriesTitle,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
                if (error) throw error;
                break;
            }
            case 'DELETE_BOOK': {
                const bookId = op.payload as string;
                const { error } = await supabase.from('library_books').delete().eq('id', bookId).eq('user_id', userId);
                if (error) throw error;
                break;
            }
            case 'UPSERT_SHELVES': {
                const shelves = op.payload as string[];
                const { error } = await supabase.from('user_settings').upsert({
                    user_id: userId,
                    custom_shelves: shelves,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                if (error) throw error;
                break;
            }
        }
    }

    /**
     * Pull remote changes from Supabase and apply them locally.
     * Implements deterministic latest-update-wins.
     */
    private async pullRemoteChanges() {
        if (!navigator.onLine) return;
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) return;

        this.setSyncing(true);
        try {
            // 1. Pull books
            const { data: remoteBooks, error: booksError } = await supabase
                .from('library_books')
                .select('*')
                .eq('user_id', session.session.user.id);

            if (booksError) throw booksError;

            // Apply each remote book to the local DB if newer or doesn't exist
            if (remoteBooks) {
                const localBooks = await this.localRepo.list();
                const localMap = new Map(localBooks.map(b => [b.id, b]));

                for (const remote of remoteBooks) {
                    const mappedBook: LibraryBook = {
                        id: remote.id,
                        bookId: remote.book_id,
                        title: remote.title,
                        authors: remote.authors || [],
                        genres: remote.genres || [],
                        publicationYear: remote.publication_year,
                        sourceFormat: remote.source_format,
                        fileReference: '', // Default empty for synced books without local files
                        fileSizeBytes: remote.file_size_bytes,
                        dateAdded: new Date(remote.date_added).getTime(),
                        dateLastOpened: remote.date_last_opened ? new Date(remote.date_last_opened).getTime() : undefined,
                        readingProgress: remote.reading_progress,
                        isFavorite: remote.is_favorite,
                        seriesTitle: remote.series_title
                    };

                    const local = localMap.get(remote.id);
                    if (!local) {
                        // It's new from cloud
                        await this.localRepo.add(mappedBook);
                    } else {
                        // Conflict resolution: We should compare updated_at if we tracked it locally.
                        // Since LibraryBook doesn't track updated_at natively, we assume remote pull 
                        // overwrites unless there's a pending operation in the queue for this book.
                        
                        const pendingOps = this.queue.getQueue();
                        const hasPendingLocalUpdate = pendingOps.some(op => op.type === 'UPSERT_BOOK' && op.payload.id === remote.id);
                        
                        if (!hasPendingLocalUpdate) {
                            // Merge updates. Maintain local fileReference and coverResourceId!
                            const merged = {
                                ...mappedBook,
                                fileReference: local.fileReference,
                                coverResourceId: local.coverResourceId
                            };
                            await this.localRepo.update(local.id, merged);
                        }
                    }
                }
            }
            
            // 2. Pull settings (shelves)
            const { data: settingsData, error: settingsError } = await supabase
                .from('user_settings')
                .select('custom_shelves')
                .eq('user_id', session.session.user.id)
                .single();
                
            if (!settingsError && settingsData?.custom_shelves) {
                const pendingOps = this.queue.getQueue();
                const hasPendingShelves = pendingOps.some(op => op.type === 'UPSERT_SHELVES');
                if (!hasPendingShelves) {
                    localStorage.setItem('custom_genre_shelves', JSON.stringify(settingsData.custom_shelves));
                    // We dispatch a window event to let the UI know shelves updated
                    window.dispatchEvent(new Event('shelves_synced'));
                }
            }

        } catch (error) {
            console.error('Failed to pull remote changes', error);
        } finally {
            this.setSyncing(false);
        }
    }

    private setSyncing(status: boolean) {
        this.isSyncing = status;
        if (this.onSyncStateChanged) {
            this.onSyncStateChanged(status);
        }
    }
}
