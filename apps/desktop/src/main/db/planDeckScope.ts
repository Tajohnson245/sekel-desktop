import type Database from 'better-sqlite3';

/**
 * Remove deck IDs that `keep` rejects from every plan's deck_filter, and archive
 * any ACTIVE plan whose scope ends up empty.
 *
 * deck_filter semantics: NULL = all decks; a JSON array = exactly those decks. So
 * a pruned-to-empty '[]' means "no decks", never "all decks". A plan whose every
 * scoped deck is gone has nothing left to study; rather than keep an active plan
 * pointing at nothing (or silently widening it to every deck, as readers used to
 * do with '[]'), it is archived — the same state a manual archive leaves, so it
 * stays in plan history. Archived plans keep their pruned filter as a record.
 *
 * Shared by deck deletion (run inside the same transaction as the DELETE, so plans
 * never observe a filter pointing at a missing deck) and the boot-time orphan
 * cleanup. Takes the open db so it has no dependency on the getDb() singleton.
 */
export function prunePlanDeckScopes(
    db: Database.Database,
    keep: (deckId: string) => boolean,
): { plansUpdated: number; plansArchived: number } {
    const rows = db.prepare(
        `SELECT id, deck_filter, status FROM plans WHERE deck_filter IS NOT NULL`
    ).all() as { id: string; deck_filter: string; status: string }[];
    if (rows.length === 0) return { plansUpdated: 0, plansArchived: 0 };

    const updateFilter = db.prepare(`UPDATE plans SET deck_filter = ?, updated_at = ? WHERE id = ?`);
    const archive      = db.prepare(`UPDATE plans SET status = 'archived', updated_at = ? WHERE id = ?`);
    const now = new Date().toISOString();
    let plansUpdated = 0;
    let plansArchived = 0;

    for (const row of rows) {
        let filter: unknown;
        try { filter = JSON.parse(row.deck_filter); }
        catch { continue; }
        if (!Array.isArray(filter)) continue;

        const kept = (filter as string[]).filter(keep);
        if (kept.length !== filter.length) {
            updateFilter.run(JSON.stringify(kept), now, row.id);
            plansUpdated++;
        }
        if (kept.length === 0 && row.status === 'active') {
            archive.run(now, row.id);
            plansArchived++;
        }
    }

    return { plansUpdated, plansArchived };
}
