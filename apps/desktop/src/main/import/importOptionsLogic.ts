/**
 * Pure state logic for the ImportOptionsModal.
 * Lives in src/main/import/ so it can be imported by tests without pulling in
 * React or any DOM-dependent UI libraries.
 */

import type { ImportSummaryDeck, ImportOptionsDeck, ImportOptionsPayload } from './types';

export interface DeckState {
    selected: boolean;
    scheduling: 'keep' | 'fresh';
    algorithm: 'fsrs' | 'sm2';
    conflict: 'skip' | 'overwrite' | 'merge' | null;
    expanded: boolean;
}

export interface ImportSummaryLike {
    decks: ImportSummaryDeck[];
    mediaImageCount: number;
    mediaAudioCount: number;
    noteTypeNames: string[];
    warnings: string[];
    deckCount: number;
    noteTypeCount: number;
    noteCount: number;
    cardCount: number;
    reviewLogCount: number;
}

/**
 * Build the initial deck state map from a summary.
 * All decks start selected, scheduling=keep, algorithm=fsrs.
 * Conflicting decks default to conflict=skip.
 */
export function buildInitialDeckStates(decks: ImportSummaryDeck[]): Map<number, DeckState> {
    const m = new Map<number, DeckState>();
    for (const d of decks) {
        m.set(d.ankiDeckId, {
            selected: true,
            scheduling: 'keep',
            algorithm: 'fsrs',
            conflict: d.hasConflict ? 'skip' : null,
            expanded: false,
        });
    }
    return m;
}

/**
 * Cascade a selected/deselected state to all decks sharing the given root name.
 * Returns a new Map (immutable update).
 */
export function toggleParentDecks(
    decks: ImportSummaryDeck[],
    states: Map<number, DeckState>,
    parentRootName: string,
    selected: boolean,
): Map<number, DeckState> {
    const next = new Map(states);
    for (const d of decks) {
        if (d.nameComponents[0] === parentRootName) {
            const prev = next.get(d.ankiDeckId)!;
            next.set(d.ankiDeckId, { ...prev, selected });
        }
    }
    return next;
}

/**
 * Build the ImportOptionsPayload to send to the main process via import:confirm.
 */
export function buildPayload(
    summary: ImportSummaryLike,
    states: Map<number, DeckState>,
    mediaMap: Record<string, string>,
    mediaFilePaths: string[],
    tempDir: string,
): Omit<ImportOptionsPayload, 'userId'> {
    const decks: ImportOptionsDeck[] = summary.decks.map(d => {
        const s = states.get(d.ankiDeckId)!;
        return {
            ankiDeckId: d.ankiDeckId,
            deckName: d.name,
            selected: s.selected,
            scheduling: s.scheduling,
            algorithm: s.algorithm,
            conflict: s.conflict,
        };
    });
    return { decks, mediaMap, mediaFilePaths, tempDir };
}
