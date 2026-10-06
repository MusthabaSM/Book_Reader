import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LibraryView } from './components/library/LibraryView';
import { HomeView } from './components/library/HomeView';
import { LibraryControls } from './components/library/LibraryControls';
import { SettingsView } from './components/library/SettingsView';
import { BookReader } from './components/reader/BookReader';
import { createFileInputFromBrowserFile } from './library/utils/browser-file';
import { availableSpineGenres } from './components/library/BookSpine';

// Dependency graph composition
import { ImporterRegistry } from './formats/importers/registry';
import { BrowserBookRepository } from './library/repository/browser-book';
import { BrowserBookContentRepository } from './library/repository/browser-content';
import { SQLiteBookRepository } from './library/repository/tauri-sqlite';
import { TauriBookContentRepository } from './library/repository/tauri-content';
import { BrowserDocumentStorageRepository } from './library/repository/browser-document';
import { TauriDocumentStorageRepository } from './library/repository/tauri-document';
import { TauriCoverStorageRepository } from './library/repository/tauri-cover';
import { BrowserCoverStorageRepository } from './library/repository/browser-cover';
import { LibraryService, type BookMetadataUpdates } from './library/service';
import { FormatDetector } from './formats/detector';
import type { LibraryBook, LibraryQueryOptions } from './library/models';
import type { BookRepository, BookContentRepository } from './library/repository';
import { supabase } from './sync/supabase';
import { SyncEngine } from './sync/engine';
import { SyncWrappedBookRepository } from './sync/wrapper';
import { AuthView } from './components/auth/AuthView';

import { Paginator, type PaginationResult } from './pagination/paginator';
import { BrowserTextMeasurer } from './pagination/layout/browser-measurer';
import { calculateReadingProgress, resolveSpreadIndex } from './pagination/progress';
import type { ReadingPosition, PresentationPage } from './pagination/page-model';
import type { DocumentContent } from './book/models';
import { defaultPaginationConfig } from './pagination/layout/config';

// Initialize with dummy for now, we will replace inside the component if async init is needed,
// but LibraryService can be instantiated once the repos are ready.
// The registry constructor automatically adds TxtImporter and EpubImporter,
// and PdfImporter if DocumentStorageRepository is provided.

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function App() {
    const [libraryService, setLibraryService] = useState<LibraryService | null>(null);
    const [books, setBooks] = useState<LibraryBook[]>([]);
    const [query, setQuery] = useState<LibraryQueryOptions>({ sortBy: 'dateAdded', sortDirection: 'desc' });
    const [activeReaderPagination, setActiveReaderPagination] = useState<PaginationResult | null>(null);
    const [initialSpreadIndex, setInitialSpreadIndex] = useState<number>(0);
    const [activeLibraryBook, setActiveLibraryBook] = useState<LibraryBook | null>(null);
    const [activeBookContent, setActiveBookContent] = useState<DocumentContent | null>(null);
    const [viewMode, setViewMode] = useState<'home' | 'shelf' | 'settings'>('home');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const [pendingImportFiles, setPendingImportFiles] = useState<File[]>([]);
    const [importGenre, setImportGenre] = useState<string>('Fiction');
    const [singlePageMode, setSinglePageMode] = useState<boolean>(() => window.innerWidth < 768);
    const [rotation, setRotation] = useState<number>(0);

    const [authMode, setAuthMode] = useState<'checking' | 'auth_required' | 'logged_in' | 'offline_mode'>('checking');
    const [syncStatus, setSyncStatus] = useState<'Offline' | 'Synced' | 'Syncing' | 'Error' | 'Local'>('Local');
    const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);

    const [customShelves, setCustomShelves] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('custom_genre_shelves') || '[]');
        } catch {
            return [];
        }
    });

    const refreshLibrary = async () => {
        if (!libraryService) return;
        const fresh = await libraryService.listBooks(query);
        setBooks(fresh);
    };

    const handleAddGenre = (genre: string) => {
        const updated = [...customShelves, genre];
        setCustomShelves(updated);
        localStorage.setItem('custom_genre_shelves', JSON.stringify(updated));
        if (syncEngine) syncEngine.enqueueShelvesUpdate(updated);
    };

    const handleEditGenre = async (oldGenre: string, newGenre: string) => {
        const updated = customShelves.map(g => g === oldGenre ? newGenre : g);
        setCustomShelves(updated);
        localStorage.setItem('custom_genre_shelves', JSON.stringify(updated));
        if (syncEngine) syncEngine.enqueueShelvesUpdate(updated);

        if (!libraryService) return;
        let needsRefresh = false;
        for (const book of books) {
            if (book.genres && book.genres.some(g => g.name === oldGenre)) {
                const newGenresList = book.genres.map(g => g.name === oldGenre ? newGenre : g.name);
                await libraryService.updateBookMetadata(book.id, { genres: newGenresList });
                needsRefresh = true;
            }
        }
        if (needsRefresh) await refreshLibrary();
    };

    const handleDeleteGenre = async (genre: string) => {
        const updated = customShelves.filter(g => g !== genre);
        setCustomShelves(updated);
        localStorage.setItem('custom_genre_shelves', JSON.stringify(updated));
        if (syncEngine) syncEngine.enqueueShelvesUpdate(updated);

        if (!libraryService) return;
        let needsRefresh = false;
        for (const book of books) {
            if (book.genres && book.genres.some(g => g.name === genre)) {
                await libraryService.removeBook(book.id);
                needsRefresh = true;
            }
        }
        if (needsRefresh) await refreshLibrary();
    };
    
    const [groupIntoSeries, setGroupIntoSeries] = useState<boolean>(false);
    const [groupTitle, setGroupTitle] = useState<string>('');
    const [activeSeriesTitle, setActiveSeriesTitle] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);

    const existingSeries = useMemo(() => {
        const seriesSet = new Set<string>();
        books.forEach(b => {
            if (b.seriesTitle) seriesSet.add(b.seriesTitle);
        });
        return Array.from(seriesSet).sort((a, b) => a.localeCompare(b));
    }, [books]);

    const availableGenres = useMemo(() => {
        const DEFAULT_GENRES = ['Manga', 'Light Novel', 'Fantasy', 'Philosophy', 'Science', 'Islam', 'Fiction'];
        const currentGenres = new Set([...DEFAULT_GENRES, ...availableSpineGenres, ...customShelves]);
        books.forEach(b => {
            b.genres?.forEach(g => currentGenres.add(g.name));
        });
        return Array.from(currentGenres).sort();
    }, [books, customShelves]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function checkAuth() {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) throw error;
                
                if (data.session) {
                    setAuthMode('logged_in');
                } else {
                    const skipped = localStorage.getItem('auth_skipped');
                    if (skipped === 'true') {
                        setAuthMode('offline_mode');
                    } else {
                        setAuthMode('auth_required');
                    }
                }
            } catch (err) {
                console.warn('Auth check failed or offline, defaulting to offline mode:', err);
                const skipped = localStorage.getItem('auth_skipped');
                setAuthMode(skipped === 'true' ? 'offline_mode' : 'auth_required');
            }
        }
        checkAuth();
    }, []);

    useEffect(() => {
        if (authMode === 'checking' || authMode === 'auth_required') return;

        async function init() {
            let bookRepo: BookRepository;
            let contentRepo: BookContentRepository;

            if (isTauri) {
                const sqliteRepo = new SQLiteBookRepository();
                await sqliteRepo.initialize();
                bookRepo = sqliteRepo;
                contentRepo = new TauriBookContentRepository();
                const docStorage = new TauriDocumentStorageRepository();
                const coverStorage = new TauriCoverStorageRepository();
                const registry = new ImporterRegistry(docStorage);
                const detector = new FormatDetector();

                let activeBookRepo = bookRepo;
                let engine: SyncEngine | null = null;
                if (authMode === 'logged_in') {
                    engine = new SyncEngine(bookRepo);
                    activeBookRepo = new SyncWrappedBookRepository(bookRepo, engine);
                    setSyncEngine(engine);
                    engine.onSyncStateChanged = (syncing) => setSyncStatus(syncing ? 'Syncing' : 'Synced');
                    if (!navigator.onLine) setSyncStatus('Offline');
                    engine.start();
                }

                const service = new LibraryService(registry, detector, activeBookRepo, contentRepo, docStorage, coverStorage);
                setLibraryService(service);
                const initialBooks = await service.listBooks(query);
                setBooks(initialBooks);
            } else {
                bookRepo = new BrowserBookRepository();
                const browserContentRepo = new BrowserBookContentRepository();
                const mockDocumentStorage = new BrowserDocumentStorageRepository();
                const mockCoverStorage = new BrowserCoverStorageRepository();
                const registry = new ImporterRegistry(mockDocumentStorage);
                const detector = new FormatDetector();

                let activeBookRepo = bookRepo;
                let engine: SyncEngine | null = null;
                if (authMode === 'logged_in') {
                    engine = new SyncEngine(bookRepo);
                    activeBookRepo = new SyncWrappedBookRepository(bookRepo, engine);
                    setSyncEngine(engine);
                    engine.onSyncStateChanged = (syncing) => setSyncStatus(syncing ? 'Syncing' : 'Synced');
                    if (!navigator.onLine) setSyncStatus('Offline');
                    engine.start();
                }

                const service = new LibraryService(registry, detector, activeBookRepo, browserContentRepo, mockDocumentStorage, mockCoverStorage);
                setLibraryService(service);
                const initialBooks = await service.listBooks(query);
                setBooks(initialBooks);
            }
        }
        init();
        
        const handleOffline = () => setSyncStatus('Offline');
        const handleOnline = () => setSyncStatus('Synced');
        const handleShelvesSynced = () => {
            try {
                setCustomShelves(JSON.parse(localStorage.getItem('custom_genre_shelves') || '[]'));
                refreshLibrary();
            } catch {}
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        window.addEventListener('shelves_synced', handleShelvesSynced);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('shelves_synced', handleShelvesSynced);
        };
    }, [authMode]);

    useEffect(() => {
        if (libraryService) {
            libraryService.listBooks(query).then(setBooks);
        }
    }, [query, libraryService]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        const fileArray = Array.from(files).sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        setPendingImportFiles(fileArray);
        
        if (activeSeriesTitle) {
            setGroupIntoSeries(true);
            setGroupTitle(activeSeriesTitle);
        }
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const confirmImport = async () => {
        if (!libraryService || pendingImportFiles.length === 0) return;

        setIsImporting(true);
        try {
            if (groupIntoSeries && groupTitle.trim() === '') {
                alert("Please enter a Series Title, or uncheck the 'Group into a Series' box.");
                setIsImporting(false);
                return;
            }

            const title = groupIntoSeries ? groupTitle.trim() : '';
            
            for (const file of pendingImportFiles) {
                const fileInput = await createFileInputFromBrowserFile(file);
                const fileRef = `browser-file-${file.name}-${file.size}-${file.lastModified}`;
                
                const importedBook = await libraryService.importBook(fileInput, fileRef);
                
                const updates: BookMetadataUpdates = {};
                if (title) {
                    updates.seriesTitle = title;
                }
                if (importGenre && importGenre !== 'Uncategorized') {
                    updates.genres = [importGenre];
                }
                
                if (Object.keys(updates).length > 0) {
                    await libraryService.updateBookMetadata(importedBook.id, updates);
                }
            }

            await refreshLibrary();
            setPendingImportFiles([]);
            setGroupTitle('');
            setGroupIntoSeries(false);
        } catch (error: any) {
            console.error('Import Failed:', error);
            alert(`Import Failed: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const cancelImport = () => {
        setPendingImportFiles([]);
    };

    const paginateBook = async (bookContent: DocumentContent, isSinglePage: boolean, currentRotation: number) => {
        const config = { ...defaultPaginationConfig, forceSinglePage: isSinglePage, rotation: currentRotation };
        if (bookContent.type === 'reflowable') {
            const paginator = new Paginator();
            return paginator.paginate(bookContent, config, new BrowserTextMeasurer());
        } else {
            const { FixedPresentationEngine } = await import('./pagination/fixed-presentation/engine');
            const engine = new FixedPresentationEngine();
            const spreads = engine.paginate(bookContent, config);
            return { pages: [], spreads, config };
        }
    };

    const handleOpenBook = async (bookId: string) => {
        if (!libraryService) return;
        try {
            const { libraryBook, bookContent } = await libraryService.openBook(bookId);

            const initialRotation = 0;
            setRotation(initialRotation);
            const result = await paginateBook(bookContent, singlePageMode, initialRotation);

            setActiveBookContent(bookContent);
            setActiveLibraryBook(libraryBook);
            setActiveReaderPagination(result as any);

            const spreadIndex = resolveSpreadIndex(libraryBook.readingProgress?.position, (result as any).spreads);
            setInitialSpreadIndex(spreadIndex);

            await refreshLibrary();
        } catch (error: any) {
            console.error('Failed to open book:', error);
            alert(`Failed to open book: ${error.message}`);
        }
    };

    const handleToggleSinglePage = async () => {
        if (!activeBookContent) return;
        const newMode = !singlePageMode;
        setSinglePageMode(newMode);
        
        const result = await paginateBook(activeBookContent, newMode, rotation);
        setActiveReaderPagination(result as any);
    };

    const handleRotate = async () => {
        if (!activeBookContent) return;
        const newRotation = (rotation + 90) % 360;
        setRotation(newRotation);
        
        const result = await paginateBook(activeBookContent, singlePageMode, newRotation);
        
        const position = activeLibraryBook?.readingProgress?.position;
        const newSpreadIndex = resolveSpreadIndex(position, result.spreads as any);
        
        setActiveReaderPagination(result as any);
        setInitialSpreadIndex(newSpreadIndex);
    };

    const handleRemoveBook = async (bookId: string) => {
        if (!libraryService) return;
        if (confirm('Are you sure you want to remove this book from your library?')) {
            await libraryService.removeBook(bookId);
            await refreshLibrary();
        }
    };

    const handleUpdateBook = async (bookId: string, updates: BookMetadataUpdates) => {
        if (!libraryService) return;
        await libraryService.updateBookMetadata(bookId, updates);
        await refreshLibrary();
    };

    const handleUpdateCover = async (bookId: string, file: File) => {
        if (!libraryService) return;
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            await libraryService.updateBookCover(bookId, { data });
            await refreshLibrary();
        } catch (error: any) {
            console.error('Failed to update cover:', error);
            alert(`Failed to update cover: ${error.message}`);
        }
    };

    const handleProgressUpdate = useCallback(async (payload: { page: PresentationPage, spreadIndex: number }) => {
        if (!libraryService || !activeLibraryBook) return;

        let position: ReadingPosition;
        if (payload.page.type === 'fixed') {
            position = {
                type: 'fixed',
                bookId: activeLibraryBook.bookId,
                pageIndex: payload.page.pageIndex
            };
        } else {
            position = {
                type: 'reflowable',
                bookId: activeLibraryBook.bookId,
                chapterId: payload.page.startPosition.chapterId,
                blockId: payload.page.startPosition.blockId,
                inlineOffset: payload.page.startPosition.inlineOffset
            };
        }

        if (!activeBookContent) return;

        const percentage = calculateReadingProgress(position, activeBookContent);

        await libraryService.updateReadingProgress(activeLibraryBook.id, {
            bookId: activeLibraryBook.bookId,
            position,
            percentage,
            lastOpenedTimestamp: Date.now()
        });

        await refreshLibrary();
    }, [libraryService, activeLibraryBook, activeBookContent]);

    const resolveDocumentSource = useCallback(async (id: string) => {
        return await libraryService!.getDocumentSource(id);
    }, [libraryService]);

    const closeReader = () => {
        setActiveReaderPagination(null);
        setActiveLibraryBook(null);
        setActiveBookContent(null);
        setInitialSpreadIndex(0);
        refreshLibrary();
    };

    if (authMode === 'checking') return null;

    if (authMode === 'auth_required') {
        return (
            <AuthView 
                onLoginSuccess={() => setAuthMode('logged_in')} 
                onSkip={() => {
                    localStorage.setItem('auth_skipped', 'true');
                    setAuthMode('offline_mode');
                }} 
            />
        );
    }

    if (!libraryService) return null;

    if (activeReaderPagination && activeLibraryBook && activeBookContent) {
        return (
            <BookReader
                paginationResult={activeReaderPagination}
                resolveDocumentSource={resolveDocumentSource}
                initialSpreadIndex={initialSpreadIndex}
                onProgressUpdate={handleProgressUpdate}
                bookContent={activeBookContent}
                bookTitle={activeLibraryBook.title}
                onClose={closeReader}
                singlePageMode={singlePageMode}
                onToggleSinglePage={handleToggleSinglePage}
                onRotate={handleRotate}
            />
        );
    }

    return (
        <div className="library-app-container">
            <input
                type="file"
                multiple
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept=".epub,.txt,.pdf,.cbz"
            />

            <header className="library-header">
                <div className="library-hero">
                    <h1 className="library-hero-title">OHARA</h1>
                    <p className="library-hero-subtitle">House of Knowledge</p>

                    <div className="view-toggle">
                        <button
                            className={`view-toggle-btn ${viewMode === 'home' ? 'active' : ''}`}
                            onClick={() => setViewMode('home')}
                        >
                            Home
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'shelf' ? 'active' : ''}`}
                            onClick={() => setViewMode('shelf')}
                        >
                            Bookshelf
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <button 
                        onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
                        className="library-btn library-btn-secondary"
                        style={{ padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
                    >
                        {theme === 'light' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5"></circle>
                                <line x1="12" y1="1" x2="12" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="3" y2="12"></line>
                                <line x1="21" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                            </svg>
                        )}
                    </button>
                    <button onClick={() => setViewMode('settings')} className={`library-btn library-btn-ghost ${viewMode === 'settings' ? 'active' : ''}`} title="Settings" style={{ padding: '0.5rem', width: 'auto' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </button>
                    {authMode === 'logged_in' && (
                        <div style={{ fontSize: '0.8rem', color: syncStatus === 'Syncing' ? 'var(--accent)' : syncStatus === 'Offline' ? 'var(--danger)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px',
                                background: syncStatus === 'Syncing' ? 'var(--accent)' : syncStatus === 'Offline' ? 'var(--danger)' : 'var(--text-secondary)'
                            }}></span>
                            {syncStatus}
                        </div>
                    )}
                    <button 
                        onClick={async () => {
                            if (authMode === 'logged_in') {
                                await supabase.auth.signOut();
                                localStorage.removeItem('auth_skipped');
                                setAuthMode('auth_required');
                                if (syncEngine) syncEngine.stop();
                            } else {
                                setAuthMode('auth_required');
                            }
                        }} 
                        className="library-btn library-btn-ghost" 
                        style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                    >
                        {authMode === 'logged_in' ? 'Sign Out' : 'Sign In'}
                    </button>
                    <button onClick={handleImportClick} className="library-btn library-btn-primary">
                        + Import Book
                    </button>
                </div>
            </header>

            {viewMode === 'settings' ? (
                <main className="library-main">
                    <SettingsView 
                        customGenres={customShelves}
                        onAddGenre={handleAddGenre}
                        onEditGenre={handleEditGenre}
                        onDeleteGenre={handleDeleteGenre}
                        onClose={() => setViewMode('home')}
                    />
                </main>
            ) : (
                <>
                    <LibraryControls
                        currentQuery={query}
                        onQueryChange={setQuery}
                    />

                    <main className="library-main">
                        {!libraryService ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>Initializing Library...</div>
                        ) : activeSeriesTitle ? (
                    <div>
                        <button 
                            className="library-btn library-btn-secondary" 
                            style={{ marginBottom: '1rem' }}
                            onClick={() => setActiveSeriesTitle(null)}
                        >
                            ← Back to Main Library
                        </button>
                        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Series: {activeSeriesTitle}</h2>
                        <LibraryView
                            books={books.filter(b => b.seriesTitle === activeSeriesTitle)}
                            onOpenBook={handleOpenBook}
                            onRemoveBook={handleRemoveBook}
                            onUpdateBook={handleUpdateBook}
                            onGetCover={libraryService.getCoverSource.bind(libraryService)}
                            onUpdateCover={handleUpdateCover}
                        />
                    </div>
                ) : viewMode === 'home' ? (
                    <HomeView
                        books={books.filter(b => b.isFavorite)}
                        onOpenBook={handleOpenBook}
                        onRemoveBook={handleRemoveBook}
                        onUpdateBook={handleUpdateBook}
                        onGetCover={libraryService.getCoverSource.bind(libraryService)}
                        onUpdateCover={handleUpdateCover}
                        onOpenSeries={setActiveSeriesTitle}
                    />
                ) : (
                    <LibraryView
                        books={books}
                        onOpenBook={handleOpenBook}
                        onRemoveBook={handleRemoveBook}
                        onUpdateBook={handleUpdateBook}
                        onGetCover={libraryService.getCoverSource.bind(libraryService)}
                        onUpdateCover={handleUpdateCover}
                        onOpenSeries={setActiveSeriesTitle}
                    />
                )}
            </main>
            </>
            )}

            {pendingImportFiles.length > 0 && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    zIndex: 9999,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={cancelImport}>
                    <div
                        className="library-edit-form"
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            top: 'auto', left: 'auto',
                            width: '400px', maxWidth: '90vw',
                            margin: 0,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}
                    >
                        <div className="library-edit-title">Import Book</div>

                        <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Files: <strong>{pendingImportFiles.length} book{pendingImportFiles.length > 1 ? 's' : ''} selected</strong>
                            {pendingImportFiles.length === 1 && <span> ({pendingImportFiles[0].name})</span>}
                        </div>

                        <label className="library-edit-label">Which shelf do you want to place it on?</label>
                        <div className="import-genre-grid">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="import-genre"
                                    checked={importGenre === 'Uncategorized'}
                                    onChange={() => setImportGenre('Uncategorized')}
                                />
                                Uncategorized
                            </label>
                            {availableGenres.map(genre => (
                                <label key={genre} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="import-genre"
                                        checked={importGenre === genre}
                                        onChange={() => setImportGenre(genre)}
                                    />
                                    {genre}
                                </label>
                            ))}
                        </div>

                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer', marginBottom: groupIntoSeries ? '0.75rem' : 0 }}>
                                <input 
                                    type="checkbox" 
                                    checked={groupIntoSeries}
                                    onChange={e => setGroupIntoSeries(e.target.checked)}
                                />
                                Group into a Series
                            </label>
                            
                            {groupIntoSeries && (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Series Title</label>
                                    <input 
                                        type="text" 
                                        list="existing-series-list"
                                        className="library-input"
                                        placeholder="e.g., One Piece"
                                        value={groupTitle}
                                        onChange={e => setGroupTitle(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                    <datalist id="existing-series-list">
                                        {existingSeries.map(s => (
                                            <option key={s} value={s} />
                                        ))}
                                    </datalist>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0 }}>
                                        Books in the same series are automatically grouped into a single folder.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button onClick={cancelImport} className="library-btn library-btn-secondary" disabled={isImporting}>Cancel</button>
                            <button onClick={confirmImport} className="library-btn library-btn-primary" disabled={isImporting}>
                                {isImporting ? 'Importing...' : `Import ${pendingImportFiles.length} Book${pendingImportFiles.length > 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
