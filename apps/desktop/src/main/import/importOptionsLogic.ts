/**
 * Pure state logic for the ImportOptionsModal.
 * Lives in src/main/import/ so it can be imported by tests without pulling in
 * React or any DOM-dependent UI libraries.
 */

import type { ImportSummaryDeck, ImportOptionsDeck, ImportOptionsPayload } from './types';

export type HierarchyMode = 'subdecks' | 'individual';

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
 * Apply hierarchy mode changes to deck states.
 * When switching to 'individual': auto-deselect empty container decks (cardCount === 0).
 * When switching to 'subdecks': re-select all decks.
 */
export function applyHierarchyMode(
    decks: ImportSummaryDeck[],
    states: Map<number, DeckState>,
    mode: HierarchyMode,
): Map<number, DeckState> {
    const next = new Map(states);
    for (const d of decks) {
        const prev = next.get(d.ankiDeckId)!;
        if (mode === 'individual') {
            // Auto-deselect empty containers (decks with 0 cards)
            if (d.cardCount === 0) {
                next.set(d.ankiDeckId, { ...prev, selected: false });
            }
        } else {
            // Re-select all when switching back to subdecks
            next.set(d.ankiDeckId, { ...prev, selected: true });
        }
    }
    return next;
}

/**
 * Resolve display names for individual mode.
 * Uses leaf name (last nameComponent), disambiguating collisions
 * by prepending the immediate parent: "Algebra - Basics" vs "Geometry - Basics".
 */
export function resolveLeafNames(decks: ImportSummaryDeck[]): Map<number, string> {
    const result = new Map<number, string>();

    // First pass: collect leaf names and detect collisions
    const leafGroups = new Map<string, ImportSummaryDeck[]>();
    for (const d of decks) {
        const leaf = d.nameComponents[d.nameComponents.length - 1];
        if (!leafGroups.has(leaf)) leafGroups.set(leaf, []);
        leafGroups.get(leaf)!.push(d);
    }

    // Second pass: assign names, disambiguating collisions
    for (const [leaf, group] of leafGroups) {
        if (group.length === 1) {
            result.set(group[0].ankiDeckId, leaf);
        } else {
            // Disambiguate by prepending immediate parent
            for (const d of group) {
                if (d.nameComponents.length >= 2) {
                    const parent = d.nameComponents[d.nameComponents.length - 2];
                    result.set(d.ankiDeckId, `${parent} - ${leaf}`);
                } else {
                    result.set(d.ankiDeckId, leaf);
                }
            }
        }
    }

    return result;
}

/**
 * Build the ImportOptionsPayload to send to the main process via import:confirm.
 */
export function buildPayload(
    summary: ImportSummaryLike,
    states: Map<number, DeckState>,
    hierarchyMode: HierarchyMode,
    mediaMap: Record<string, string>,
    mediaFilePaths: string[],
    tempDir: string,
): Omit<ImportOptionsPayload, 'userId'> {
    const leafNames = hierarchyMode === 'individual'
        ? resolveLeafNames(summary.decks)
        : null;

    const decks: ImportOptionsDeck[] = summary.decks.map(d => {
        const s = states.get(d.ankiDeckId)!;
        return {
            ankiDeckId: d.ankiDeckId,
            deckName: leafNames?.get(d.ankiDeckId) ?? d.name,
            selected: s.selected,
            scheduling: s.scheduling,
            algorithm: s.algorithm,
            conflict: s.conflict,
        };
    });
    return { decks, hierarchyMode, mediaMap, mediaFilePaths, tempDir };
}
