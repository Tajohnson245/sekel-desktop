import Database from 'better-sqlite3';
import {
    InvalidApkgError,
    type AnkiCollection,
    type AnkiModel,
    type AnkiFieldDef,
    type AnkiTemplate,
    type AnkiDeck,
    type AnkiDeckConfig,
    type AnkiNote,
    type AnkiCard,
    type AnkiReviewLog,
} from './types';

// ── Private raw DB row shapes ─────────────────────────────────────────────────

interface RawColRow {
    models: string;
    decks: string;
    dconf: string;
}

interface RawNoteRow {
    id: number;
    guid: string;
    mid: number;
    flds: string;
    tags: string;
    mod: number;
}

interface RawCardRow {
    id: number;
    nid: number;
    did: number;
    ord: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    mod: number;
}

interface RawRevlogRow {
    id: number;
    cid: number;
    ease: number;
    ivl: number;
    lastIvl: number;
    factor: number;
    time: number;
    type: number;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Opens the Anki SQLite database at dbPath (read-only) and parses all
 * structured data into a typed AnkiCollection.
 *
 * This is a read-only operation — nothing is written to SEKEL's database.
 * Phase 4 maps the returned collection into SEKEL's schema.
 *
 * @throws {InvalidApkgError} if col table is empty or JSON columns are malformed.
 */
export async function parseAnkiDatabase(dbPath: string): Promise<AnkiCollection> {
    return new Promise((resolve, reject) => {
        try {
            resolve(parseAnkiDatabaseSync(dbPath));
        } catch (err) {
            reject(err);
        }
    });
}

// ── Synchronous implementation ────────────────────────────────────────────────

function parseAnkiDatabaseSync(dbPath: string): AnkiCollection {
    const db = new Database(dbPath, { readonly: true });
    const warnings: string[] = [];

    try {
        const { models, decks, deckConfigs } = parseCol(db);
        const notes = parseNotes(db, models, warnings);
        const cards = parseCards(db, notes, warnings);
        const revlog = parseRevlog(db);

        return { models, decks, deckConfigs, notes, cards, revlog, warnings };
    } finally {
        db.close();
    }
}

// ── col table ─────────────────────────────────────────────────────────────────

function parseCol(db: Database.Database): {
    models: Map<number, AnkiModel>;
    decks: Map<number, AnkiDeck>;
    deckConfigs: Map<number, AnkiDeckConfig>;
} {
    const row = db.prepare('SELECT models, decks, dconf FROM col').get() as RawColRow | undefined;
    if (!row) {
        throw new InvalidApkgError('col table is empty — database may be corrupt.');
    }

    const models = parseModels(row.models);
    const decks = parseDecks(row.decks);
    const deckConfigs = parseDeckConfigs(row.dconf);

    return { models, decks, deckConfigs };
}

function parseModels(raw: string): Map<number, AnkiModel> {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
        throw new InvalidApkgError(`Failed to parse col.models: ${(e as Error).message}`);
    }

    const models = new Map<number, AnkiModel>();
    for (const entry of Object.values(parsed)) {
        const m = entry as Record<string, unknown>;
        const id = Number(m['id']);
        const flds = (m['flds'] as Record<string, unknown>[]).map(parseFieldDef);
        const tmpls = (m['tmpls'] as Record<string, unknown>[]).map(parseTemplate);

        models.set(id, {
            id,
            name: String(m['name'] ?? ''),
            flds,
            tmpls,
            css: String(m['css'] ?? ''),
            type: Number(m['type'] ?? 0),
            mod: Number(m['mod'] ?? 0),
        });
    }
    return models;
}

function parseFieldDef(raw: Record<string, unknown>): AnkiFieldDef {
    return {
        ord: Number(raw['ord'] ?? 0),
        name: String(raw['name'] ?? ''),
        sticky: Boolean(raw['sticky']),
        font: String(raw['font'] ?? ''),
        size: Number(raw['size'] ?? 0),
    };
}

function parseTemplate(raw: Record<string, unknown>): AnkiTemplate {
    const tmpl: AnkiTemplate = {
        ord: Number(raw['ord'] ?? 0),
        name: String(raw['name'] ?? ''),
        qfmt: String(raw['qfmt'] ?? ''),
        afmt: String(raw['afmt'] ?? ''),
    };
    const bqfmt = String(raw['bqfmt'] ?? '');
    const bafmt = String(raw['bafmt'] ?? '');
    if (bqfmt) tmpl.bqfmt = bqfmt;
    if (bafmt) tmpl.bafmt = bafmt;
    return tmpl;
}

function parseDecks(raw: string): Map<number, AnkiDeck> {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
        throw new InvalidApkgError(`Failed to parse col.decks: ${(e as Error).message}`);
    }

    const decks = new Map<number, AnkiDeck>();
    for (const entry of Object.values(parsed)) {
        const d = entry as Record<string, unknown>;
        const id = Number(d['id']);
        const name = String(d['name'] ?? '');

        decks.set(id, {
            id,
            name,
            nameComponents: name.split('::'),
            conf: Number(d['conf'] ?? 0),
            mod: Number(d['mod'] ?? 0),
            collapsed: Boolean(d['collapsed']),
        });
    }
    return decks;
}

function parseDeckConfigs(raw: string): Map<number, AnkiDeckConfig> {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
        throw new InvalidApkgError(`Failed to parse col.dconf: ${(e as Error).message}`);
    }

    const configs = new Map<number, AnkiDeckConfig>();
    for (const entry of Object.values(parsed)) {
        const c = entry as Record<string, unknown>;
        const id = Number(c['id']);
        const newConf = (c['new'] ?? {}) as Record<string, unknown>;
        const revConf = (c['rev'] ?? {}) as Record<string, unknown>;
        const lapseConf = (c['lapse'] ?? {}) as Record<string, unknown>;

        configs.set(id, {
            id,
            name: String(c['name'] ?? ''),
            new: {
                perDay: Number(newConf['perDay'] ?? 20),
                delays: (newConf['delays'] as number[] | undefined) ?? [],
                order: Number(newConf['order'] ?? 0),
            },
            rev: {
                perDay: Number(revConf['perDay'] ?? 200),
                ease4: Number(revConf['ease4'] ?? 1.3),
                ivlFct: Number(revConf['ivlFct'] ?? 1),
                maxIvl: Number(revConf['maxIvl'] ?? 36500),
            },
            lapse: {
                delays: (lapseConf['delays'] as number[] | undefined) ?? [],
                leechAction: Number(lapseConf['leechAction'] ?? 0),
                leechFails: Number(lapseConf['leechFails'] ?? 8),
                minInt: Number(lapseConf['minInt'] ?? 1),
                mult: Number(lapseConf['mult'] ?? 0),
            },
        });
    }
    return configs;
}

// ── notes table ───────────────────────────────────────────────────────────────

const FIELD_SEP = '\x1f';

function parseNotes(
    db: Database.Database,
    models: Map<number, AnkiModel>,
    warnings: string[],
): Map<number, AnkiNote> {
    const rows = db
        .prepare('SELECT id, guid, mid, flds, tags, mod FROM notes')
        .all() as RawNoteRow[];

    const notes = new Map<number, AnkiNote>();

    for (const row of rows) {
        const model = models.get(row.mid);
        if (!model) {
            warnings.push(
                `Note ${row.id}: unknown model id ${row.mid}, field names unavailable — using positional fallback keys.`,
            );
        }

        const values = row.flds.split(FIELD_SEP);
        const fields: Record<string, string> = {};

        if (model) {
            const fieldCount = Math.max(values.length, model.flds.length);
            for (let i = 0; i < fieldCount; i++) {
                const name = model.flds[i]?.name ?? `field_${i}`;
                fields[name] = values[i] ?? '';
            }
        } else {
            // Fallback: use positional keys
            for (let i = 0; i < values.length; i++) {
                fields[`field_${i}`] = values[i] ?? '';
            }
        }

        const tags = row.tags.trim().split(/\s+/).filter(Boolean);

        notes.set(row.id, {
            id: row.id,
            guid: row.guid,
            mid: row.mid,
            fields,
            rawFlds: row.flds,
            tags,
            mod: row.mod,
        });
    }

    return notes;
}

// ── cards table ───────────────────────────────────────────────────────────────

function parseCards(
    db: Database.Database,
    notes: Map<number, AnkiNote>,
    warnings: string[],
): AnkiCard[] {
    const rows = db
        .prepare(
            'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, mod FROM cards',
        )
        .all() as RawCardRow[];

    const cards: AnkiCard[] = [];

    for (const row of rows) {
        if (!notes.has(row.nid)) {
            warnings.push(`Card ${row.id}: references unknown note id ${row.nid}.`);
        }

        cards.push({
            id: row.id,
            nid: row.nid,
            did: row.did,
            ord: row.ord,
            type: row.type,
            queue: row.queue,
            due: row.due,
            ivl: row.ivl,
            factor: row.factor,
            reps: row.reps,
            lapses: row.lapses,
            mod: row.mod,
        });
    }

    return cards;
}

// ── revlog table ──────────────────────────────────────────────────────────────

function parseRevlog(db: Database.Database): AnkiReviewLog[] {
    const rows = db
        .prepare('SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog')
        .all() as RawRevlogRow[];

    return rows.map((row) => ({
        id: row.id,
        cid: row.cid,
        ease: row.ease,
        ivl: row.ivl,
        lastIvl: row.lastIvl,
        factor: row.factor,
        time: row.time,
        type: row.type,
    }));
}
