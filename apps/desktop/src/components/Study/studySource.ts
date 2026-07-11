import type { CardWithNote } from '../../lib/queries';

/**
 * What a study session is drawing from. The single-deck player (`StudySession`)
 * and the cross-deck player both feed the shared `StudyPlayer` engine via this
 * union so the engine never has to know how its card queue was assembled.
 */
export type StudySource =
    | { kind: 'deck'; deckId: string; mode: 'due' | 'all'; systemKeys: string[] }
    | { kind: 'cross-deck'; scope: 'all' | 'plan'; deckIds: string[] | null; mode: 'due'; systemKeys: string[] };

/** Stable string identity for a source — drives StudyPlayer's per-session reset. */
export function sourceKey(source: StudySource): string {
    if (source.kind === 'deck') {
        return `deck:${source.deckId}:${source.mode}:${source.systemKeys.join(',')}`;
    }
    const ids = source.deckIds === null ? 'all' : [...source.deckIds].sort().join(',');
    return `xdeck:${source.scope}:${source.mode}:${ids}:${source.systemKeys.join(',')}`;
}

/** A focused (weak-system) session carries system keys; a plain queue does not. */
export function isFocusedSource(source: StudySource): boolean {
    return source.systemKeys.length > 0;
}

/** Per-card algorithm resolver type — lets a cross-deck queue mix FSRS and SM-2 decks. */
export type ResolveFsrs = (card: CardWithNote) => boolean;
