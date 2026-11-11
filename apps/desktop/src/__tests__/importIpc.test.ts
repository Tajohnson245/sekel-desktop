import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ── IPC harness: capture handlers registered via instrumentedHandle ───────────

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
const quitListeners: Array<() => void> = [];

vi.mock('@sekel/observability', () => ({
    instrumentedHandle: (channel: string, handler: Handler) => { handlers.set(channel, handler); },
}));

vi.mock('electron', () => ({
    app: { on: (evt: string, cb: () => void) => { if (evt === 'will-quit') quitListeners.push(cb); } },
    dialog: { showOpenDialog: vi.fn() },
}));

// ── Pipeline mocks ────────────────────────────────────────────────────────────

const mockProcessApkg = vi.fn();
const mockParseAnkiDatabase = vi.fn();
const mockBuildImportSummary = vi.fn();
const mockExecuteImport = vi.fn();
const mockExtractMedia = vi.fn();

vi.mock('../main/import/apkg', () => ({ processApkgFile: (...a: unknown[]) => mockProcessApkg(...a) }));
vi.mock('../main/import/parser', () => ({ parseAnkiDatabase: (...a: unknown[]) => mockParseAnkiDatabase(...a) }));
vi.mock('../main/import/summaryBuilder', () => ({ buildImportSummary: (...a: unknown[]) => mockBuildImportSummary(...a) }));
vi.mock('../main/import/insertionEngine', () => ({ executeImport: (...a: unknown[]) => mockExecuteImport(...a) }));
vi.mock('../main/import/media', () => ({ extractMedia: (...a: unknown[]) => mockExtractMedia(...a) }));
vi.mock('../main/db/service', () => ({ fetchDecksByAnkiIds: vi.fn().mockReturnValue([]) }));
vi.mock('../main/db/index', () => ({
    getDb: () => ({ prepare: () => ({ run: vi.fn(), get: vi.fn().mockReturnValue(undefined) }) }),
}));
vi.mock('../ipc/classify', () => ({ classifyCardsBatch: vi.fn().mockResolvedValue(undefined) }));

// tempCleanup is intentionally NOT mocked — the real confinement check runs.
import { makeTempDirPath } from '../main/import/tempCleanup';
import { setupImportHandlers } from '../ipc/import';

const event = { sender: { isDestroyed: () => false, send: vi.fn() } };

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const h = handlers.get(channel);
    if (!h) throw new Error(`no handler for ${channel}`);
    return Promise.resolve(h(event, ...args));
}

const CACHED_MEDIA = { '0': 'a.jpg' };
const EVIL_MEDIA = { '..\\..\\Pictures\\id.jpg': 'id.jpg' };

/** Creates a real import temp dir and wires processApkgFile to return it. */
async function startSession(): Promise<{ tempDir: string; dbFilePath: string }> {
    const tempDir = makeTempDirPath();
    await fsPromises.mkdir(tempDir);
    const dbFilePath = path.join(tempDir, 'collection.anki21');
    mockProcessApkg.mockResolvedValueOnce({
        format: 'legacy2', dbFilePath, mediaMap: { ...CACHED_MEDIA }, mediaFilePaths: [], warnings: [], tempDir,
    });
    await invoke('import:process-apkg', 'C:\\some\\deck.apkg');
    return { tempDir, dbFilePath };
}

beforeAll(() => { setupImportHandlers(); });
afterAll(() => { for (const cb of quitListeners) cb(); });

beforeEach(() => {
    vi.clearAllMocks();
    mockParseAnkiDatabase.mockResolvedValue({ decks: new Map() });
    mockBuildImportSummary.mockReturnValue({ decks: [] });
    mockExtractMedia.mockResolvedValue({ extracted: 0, skipped: 0, warnings: [], mediaRecords: [] });
    mockExecuteImport.mockReturnValue({
        decksCreated: 1, decksSkipped: 0, notesInserted: 0, notesSkipped: 0,
        cardsInserted: 0, reviewsInserted: 0, cardIds: [],
    });
});

describe('import IPC — renderer-supplied values are not trusted', () => {
    it('get-summary parses the cached DB path and media map, not the renderer args', async () => {
        const { tempDir, dbFilePath } = await startSession();

        await invoke('import:get-summary', {
            dbFilePath: 'C:\\Users\\victim\\other.db',
            mediaMap: EVIL_MEDIA,
            mediaFilePaths: [],
            userId: 'u1',
            tempDir,
        });

        expect(mockParseAnkiDatabase).toHaveBeenCalledWith(dbFilePath);
        expect(mockBuildImportSummary).toHaveBeenCalledWith(expect.anything(), CACHED_MEDIA, []);
        await invoke('import:cleanup', tempDir);
    });

    it('confirm extracts media using main\'s cached map, ignoring payload.mediaMap', async () => {
        const { tempDir } = await startSession();
        await invoke('import:get-summary', { dbFilePath: '', mediaMap: {}, mediaFilePaths: [], userId: 'u1', tempDir });

        await invoke('import:confirm', {
            decks: [], hierarchyMode: 'subdecks', mediaMap: EVIL_MEDIA, mediaFilePaths: [], tempDir, userId: 'u1',
        });

        expect(mockExtractMedia).toHaveBeenCalledTimes(1);
        expect(mockExtractMedia.mock.calls[0][0]).toBe(tempDir);
        expect(mockExtractMedia.mock.calls[0][1]).toEqual(CACHED_MEDIA);
        expect(mockExecuteImport.mock.calls[0][0].mediaMap).toEqual(CACHED_MEDIA);
        // confirm owns cleanup of its temp dir
        expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('get-summary rejects a tempDir main never created', async () => {
        const fake = path.join(os.tmpdir(), `sekel-import-${randomUUID()}`);
        await expect(invoke('import:get-summary', {
            dbFilePath: 'x', mediaMap: {}, mediaFilePaths: [], userId: 'u1', tempDir: fake,
        })).rejects.toThrow(/Unknown import session/);
        expect(mockParseAnkiDatabase).not.toHaveBeenCalled();
    });

    it('confirm rejects a tempDir without a parsed collection', async () => {
        const { tempDir } = await startSession();
        await expect(invoke('import:confirm', {
            decks: [], hierarchyMode: 'subdecks', mediaMap: {}, mediaFilePaths: [], tempDir, userId: 'u1',
        })).rejects.toThrow(/No cached collection/);
        expect(mockExtractMedia).not.toHaveBeenCalled();
        await invoke('import:cleanup', tempDir);
    });

    it('cleanup refuses to delete a path that is not an import temp dir', async () => {
        const victim = path.join(os.tmpdir(), `sekel-victim-${randomUUID()}`);
        await fsPromises.mkdir(victim);
        await fsPromises.writeFile(path.join(victim, 'keep.txt'), 'keep');
        try {
            await invoke('import:cleanup', victim);
            await invoke('import:cleanup', os.homedir());
            expect(fs.existsSync(path.join(victim, 'keep.txt'))).toBe(true);
        } finally {
            await fsPromises.rm(victim, { recursive: true, force: true });
        }
    });

    it('cleanup removes a real session dir and forgets the session', async () => {
        const { tempDir } = await startSession();
        await invoke('import:cleanup', tempDir);
        expect(fs.existsSync(tempDir)).toBe(false);
        await expect(invoke('import:get-summary', {
            dbFilePath: '', mediaMap: {}, mediaFilePaths: [], userId: 'u1', tempDir,
        })).rejects.toThrow(/Unknown import session/);
    });
});
