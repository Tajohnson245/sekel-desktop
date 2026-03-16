import type { AnkiCollection, ImportSummary, ImportSummaryDeck } from './types';

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|svg|webp|bmp)$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|flac|aac|m4a|opus)$/i;

/**
 * Builds a renderer-safe ImportSummary from a parsed AnkiCollection.
 * Pure function — no IPC, no DB calls. Testable as a plain Node module.
 *
 * @param collection   Parsed AnkiCollection from parseAnkiDatabase()
 * @param mediaMap     Numeric-key → filename map from ApkgImportResult
 * @param existingDecks SEKEL decks that already have an anki_id (for conflict detection)
 */
export function buildImportSummary(
    collection: AnkiCollection,
    mediaMap: Record<string, string>,
    existingDecks: Array<{ anki_id: number | null; id: string }>,
): ImportSummary {
    // Build O(1) conflict lookup: anki_id → sekel_uuid
    const existingByAnkiId = new Map<number, string>();
    for (const d of existingDecks) {
        if (d.anki_id !== null) existingByAnkiId.set(d.anki_id, d.id);
    }

    // Anki always includes a built-in "Default" deck with id=1.
    // It is typically empty in exported packages and should not be shown to users.
    const decks: ImportSummaryDeck[] = Array.from(collection.decks.values())
        .filter(d => d.id !== 1)
        .map(d => ({
            ankiDeckId: d.id,
            name: d.name,
            nameComponents: d.nameComponents,
            hasConflict: existingByAnkiId.has(d.id),
            existingDeckId: existingByAnkiId.get(d.id),
        }));

    // Count media files by type
    let mediaImageCount = 0;
    let mediaAudioCount = 0;
    for (const filename of Object.values(mediaMap)) {
        if (IMAGE_EXT.test(filename)) mediaImageCount++;
        else if (AUDIO_EXT.test(filename)) mediaAudioCount++;
    }

    return {
        deckCount: decks.length,
        noteTypeCount: collection.models.size,
        noteCount: collection.notes.size,
        cardCount: collection.cards.length,
        reviewLogCount: collection.revlog.length,
        mediaImageCount,
        mediaAudioCount,
        decks,
        noteTypeNames: Array.from(collection.models.values()).map(m => m.name),
        warnings: collection.warnings,
    };
}
