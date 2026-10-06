import type { Spread } from '../../pagination/page-model';
import type { PaginationResult } from '../../pagination/paginator';
import type { PageTurnDirection } from '../../animation/gsap/config';

export interface ReaderState {
    spreads: Spread[];
    currentSpreadIndex: number;
    totalSpreads: number;
    zoomLevel: number;
    // Animation state
    isTurning: boolean;
    turnDirection: PageTurnDirection | null;
    nextSpreadIndex: number | null;
    turnId: number;
    
    // Search
    searchQuery: string | null;
    searchResults: any[]; // Using any for now to avoid circular import with SearchService, or we can just import SearchMatch
    currentSearchMatchIndex: number;
    isSearchVisible: boolean;
    isSearching: boolean;
}

export type ReaderAction = 
    | { type: 'SET_PAGINATION'; result: PaginationResult; initialZoom?: number; initialSpreadIndex?: number }
    | { type: 'NEXT_SPREAD' } // Instant
    | { type: 'PREV_SPREAD' } // Instant
    | { type: 'GOTO_SPREAD', index: number } // Instant jump
    | { type: 'START_TURN'; direction: PageTurnDirection }
    | { type: 'COMMIT_TURN'; turnId: number }
    | { type: 'CANCEL_TURN' }
    | { type: 'FIRST_SPREAD' }
    | { type: 'LAST_SPREAD' }
    | { type: 'ZOOM_IN' }
    | { type: 'ZOOM_OUT' }
    | { type: 'SET_ZOOM'; zoomLevel: number }
    | { type: 'RESET_ZOOM' }
    | { type: 'TOGGLE_SEARCH' }
    | { type: 'SET_SEARCH_QUERY'; query: string }
    | { type: 'SET_SEARCH_RESULTS'; results: any[] }
    | { type: 'SET_IS_SEARCHING'; isSearching: boolean }
    | { type: 'NEXT_SEARCH_MATCH' }
    | { type: 'PREV_SEARCH_MATCH' };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
    switch (action.type) {
        case 'SET_PAGINATION':
            return {
                ...state,
                spreads: action.result.spreads,
                totalSpreads: action.result.spreads.length,
                currentSpreadIndex: action.initialSpreadIndex ?? 0,
                zoomLevel: action.initialZoom ?? 1.0,
                isTurning: false,
                turnDirection: null,
                nextSpreadIndex: null,
                turnId: 0,
                searchQuery: null,
                searchResults: [],
                currentSearchMatchIndex: 0,
                isSearchVisible: false,
                isSearching: false
            };
        case 'START_TURN': {
            if (state.isTurning) return state; // Lock
            const target = action.direction === 'forward' ? state.currentSpreadIndex + 1 : state.currentSpreadIndex - 1;
            if (target < 0 || target >= state.totalSpreads) return state; // Bounds
            return {
                ...state,
                isTurning: true,
                turnDirection: action.direction,
                nextSpreadIndex: target,
                turnId: state.turnId + 1
            };
        }
        case 'COMMIT_TURN': {
            if (!state.isTurning || state.nextSpreadIndex === null || state.turnId !== action.turnId) return state;
            return {
                ...state,
                currentSpreadIndex: state.nextSpreadIndex,
                isTurning: false,
                turnDirection: null,
                nextSpreadIndex: null
            };
        }
        case 'CANCEL_TURN': {
            return {
                ...state,
                isTurning: false,
                turnDirection: null,
                nextSpreadIndex: null
            };
        }
        case 'NEXT_SPREAD':
            if (state.isTurning) return state;
            return {
                ...state,
                currentSpreadIndex: Math.min(state.currentSpreadIndex + 1, Math.max(state.totalSpreads - 1, 0))
            };
        case 'PREV_SPREAD':
            if (state.isTurning) return state;
            return {
                ...state,
                currentSpreadIndex: Math.max(state.currentSpreadIndex - 1, 0)
            };
        case 'FIRST_SPREAD':
            if (state.isTurning) return state;
            return {
                ...state,
                currentSpreadIndex: 0
            };
        case 'LAST_SPREAD':
            if (state.isTurning) return state;
            return {
                ...state,
                currentSpreadIndex: Math.max(state.totalSpreads - 1, 0)
            };
        case 'GOTO_SPREAD':
            if (state.isTurning) return state;
            return {
                ...state,
                currentSpreadIndex: Math.min(Math.max(action.index, 0), Math.max(state.totalSpreads - 1, 0))
            };
        case 'ZOOM_IN':
            return {
                ...state,
                zoomLevel: Math.min(state.zoomLevel + 0.25, 10.0)
            };
        case 'ZOOM_OUT':
            return {
                ...state,
                zoomLevel: Math.max(state.zoomLevel - 0.25, 0.5)
            };
        case 'SET_ZOOM':
            return {
                ...state,
                zoomLevel: Math.max(0.2, Math.min(action.zoomLevel, 10.0))
            };
        case 'RESET_ZOOM':
            return {
                ...state,
                zoomLevel: 1.0
            };
        case 'TOGGLE_SEARCH':
            return {
                ...state,
                isSearchVisible: !state.isSearchVisible,
                // Clear search if closing
                searchQuery: state.isSearchVisible ? null : state.searchQuery,
                searchResults: state.isSearchVisible ? [] : state.searchResults,
                currentSearchMatchIndex: state.isSearchVisible ? 0 : state.currentSearchMatchIndex
            };
        case 'SET_SEARCH_QUERY':
            return {
                ...state,
                searchQuery: action.query,
                searchResults: [],
                currentSearchMatchIndex: 0
            };
        case 'SET_SEARCH_RESULTS':
            return {
                ...state,
                searchResults: action.results,
                currentSearchMatchIndex: 0,
                ...(action.results.length > 0 ? { currentSpreadIndex: findSpreadIndexForMatch(action.results[0], state.spreads) ?? state.currentSpreadIndex } : {})
            };
        case 'SET_IS_SEARCHING':
            return {
                ...state,
                isSearching: action.isSearching
            };
        case 'NEXT_SEARCH_MATCH': {
            if (state.searchResults.length === 0) return state;
            const nextIdx = (state.currentSearchMatchIndex + 1) % state.searchResults.length;
            return {
                ...state,
                currentSearchMatchIndex: nextIdx,
                currentSpreadIndex: findSpreadIndexForMatch(state.searchResults[nextIdx], state.spreads) ?? state.currentSpreadIndex
            };
        }
        case 'PREV_SEARCH_MATCH': {
            if (state.searchResults.length === 0) return state;
            const prevIdx = (state.currentSearchMatchIndex - 1 + state.searchResults.length) % state.searchResults.length;
            return {
                ...state,
                currentSearchMatchIndex: prevIdx,
                currentSpreadIndex: findSpreadIndexForMatch(state.searchResults[prevIdx], state.spreads) ?? state.currentSpreadIndex
            };
        }
        default:
            return state;
    }
}

function findSpreadIndexForMatch(match: any, spreads: any[]): number | null {
    if (!match) return null;
    
    for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        
        // Check fixed pages
        if (spread.leftPage?.type === 'fixed' && spread.leftPage.pageIndex === match.pageOrChapterIndex) return i;
        if (spread.rightPage?.type === 'fixed' && spread.rightPage.pageIndex === match.pageOrChapterIndex) return i;
        
        // Check reflowable pages
        if (spread.leftPage?.type === 'reflowable') {
            if (spread.leftPage.startPosition?.chapterId === match.pageOrChapterIndex.toString() || 
                spread.leftPage.elements.some((e: any) => e.sourceChapterId === match.pageOrChapterIndex.toString() || e.sourceBlockId === match.reflowableBlockId)) {
                return i;
            }
        }
        if (spread.rightPage?.type === 'reflowable') {
            if (spread.rightPage.startPosition?.chapterId === match.pageOrChapterIndex.toString() || 
                spread.rightPage.elements.some((e: any) => e.sourceChapterId === match.pageOrChapterIndex.toString() || e.sourceBlockId === match.reflowableBlockId)) {
                return i;
            }
        }
    }
    
    return null;
}
