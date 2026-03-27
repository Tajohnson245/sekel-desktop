# Backup System
> Automatic backups, native .sekel export/import, deletion safety, and database integrity checking for the Sekel desktop app.

---

## Overview

Sekel stores all flashcard data in a single local SQLite file (`sekel.db`). The backup system protects against data loss through four layers:

1. **Automatic periodic backups** — WAL-safe `.backup()` snapshots on a configurable schedule
2. **Native .sekel export/import** — portable ZIP-based format for all Sekel data (not just Anki-imported cards)
3. **Deletion log** — JSONL record of deleted decks/notes for recovery
4. **Database integrity check** — `PRAGMA integrity_check` + `PRAGMA foreign_key_check` accessible from UI

---

## Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │              Main Process                     │
                        │                                              │
  Renderer              │  backup/service.ts    ← scheduler, rotation  │
  BackupTab.tsx         │  backup/restore.ts    ← restore flow         │
  AccountTab.tsx ──IPC──│  backup/deletionLog.ts← deletion safety      │
  ExportModal.tsx       │  export/sekel.ts      ← .sekel export        │
                        │  import/sekel.ts      ← .sekel import        │
                        │  db/service.ts        ← deletion log hooks   │
                        └───────────┬──────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    {userData}/backups/     {userData}/sekel.db     {userData}/deleted_items.jsonl
    sekel-backup-*.db       (source of truth)       (deletion log)
```

### IPC Channels

| Channel | Handler | Purpose |
|---------|---------|---------|
| `backup:list` | `ipc/backup.ts` | List available backups with timestamps and sizes |
| `backup:create` | `ipc/backup.ts` | Trigger immediate manual backup |
| `backup:restore` | `ipc/backup.ts` | Restore database from a backup file |
| `backup:delete` | `ipc/backup.ts` | Delete a specific backup file |
| `backup:getSettings` | `ipc/backup.ts` | Get current backup schedule settings |
| `backup:updateSettings` | `ipc/backup.ts` | Update backup interval and retention policy |
| `backup:getTotalSize` | `ipc/backup.ts` | Total disk usage of all backups |
| `db:exportSekel` | `ipc/database.ts` | Export collection or single deck as .sekel |
| `db:getSekelImportSummary` | `ipc/database.ts` | Preview .sekel file contents before import |
| `db:importSekel` | `ipc/database.ts` | Import a .sekel file |
| `db:getDeletedItems` | `ipc/database.ts` | Read the deletion log |
| `db:checkIntegrity` | `ipc/database.ts` | Run SQLite integrity + FK checks |

---

## Key Files

| File | Role |
|------|------|
| `apps/desktop/src/main/backup/service.ts` | Backup creation, scheduling, rotation, and pruning |
| `apps/desktop/src/main/backup/restore.ts` | Database restore flow (safety backup, close, replace, reopen) |
| `apps/desktop/src/main/backup/deletionLog.ts` | JSONL deletion log — records decks/notes before hard delete |
| `apps/desktop/src/main/export/sekel.ts` | Native .sekel export — ZIP builder with JSON + optional media |
| `apps/desktop/src/main/import/sekel.ts` | Native .sekel import — ID remapping, transaction insertion |
| `apps/desktop/src/ipc/backup.ts` | IPC handler registration for all `backup:*` channels |
| `apps/desktop/src/ipc/database.ts` | Hosts `db:exportSekel`, `db:importSekel`, `db:checkIntegrity`, `db:getDeletedItems` |
| `apps/desktop/src/components/Profile/sections/BackupTab.tsx` | Backup management UI (list, create, restore, settings, integrity check) |
| `apps/desktop/src/components/Deck/ExportModal.tsx` | Format selection (.sekel vs .apkg) with media toggle |
| `apps/desktop/src/components/Profile/sections/AccountTab.tsx` | "Export Collection" button for full .sekel export |
| `apps/desktop/src/menu.ts` | File menu entries: "Create Backup", "Restore from Backup..." |
| `apps/desktop/src/preload.ts` | contextBridge — exposes `window.electronAPI.backup.*` to renderer |
| `apps/desktop/src/types/electron.d.ts` | TypeScript types: `BackupInfo`, `BackupSettings`, `RestoreResult`, `SekelImportSummary`, `SekelImportResult`, `DeletedItem` |

---

## 1. Automatic Backups

### How It Works

The backup service uses **better-sqlite3's `.backup()` API** to create consistent snapshots. This is the correct method for WAL-mode databases — raw file copy can produce corrupt backups when the WAL file is active.

```
db.backup(destinationPath)  →  {userData}/backups/sekel-backup-{ISO-timestamp}.db
```

### Lifecycle

```
App starts
  ↓
startBackupScheduler()           ← called from main.ts after handler setup
  ↓
createBackup() + pruneBackups()  ← immediate first backup on startup
  ↓
setInterval(30 min default)      ← repeating backup + prune cycle
  ↓
App quits
  ↓
stopBackupScheduler()            ← called from app.on('will-quit')
```

### Default Settings

| Setting | Default | Options |
|---------|---------|---------|
| Backup interval | 30 minutes | Manual only, 15min, 30min, 1hr, 2hr |
| Daily retention | 10 backups | 5, 10, 15, 20, 30 |
| Weekly retention | 4 backups | 2, 4, 8, 12 |
| Monthly retention | 2 backups | 1, 2, 4, 6, 12 |

### Rotation Policy

Backups are pruned after each creation:

| Age | Strategy |
|-----|----------|
| < 2 days | Keep all |
| 2–30 days | Keep one per day (daily bucket), up to `dailyRetention` |
| 30–120 days | Keep one per ISO week (weekly bucket), up to `weeklyRetention` |
| 120+ days | Keep one per month (monthly bucket), up to `monthlyRetention` |
| Everything else | Deleted |

Bucket keys: daily = `YYYY-MM-DD`, weekly = `YYYY-Wnn` (ISO week), monthly = `YYYY-MM`. When multiple backups fall in the same bucket, only the first (newest) is kept.

### Menu Integration

Two entries are added to the **File** menu:

- **Create Backup** (`CmdOrCtrl+Shift+B`) — triggers immediate backup, sends `backup:created` event to renderer
- **Restore from Backup...** — sends `backup:open-restore` event, opens the backup tab in profile

---

## 2. Backup Restore Flow

Restoring a backup replaces the entire database with a previous snapshot. The flow is designed to be safe even if the current database is corrupt.

```
User clicks "Restore" on a backup in BackupTab
  ↓
Confirmation modal shown with warnings:
  "All current data will be replaced"
  "Changes since this backup will be lost"
  ↓
User confirms
  ↓
restoreFromBackup(backupFilePath)
  │
  ├─ 1. Create safety backup of current sekel.db
  │     (so the user can undo the restore if needed)
  │
  ├─ 2. Close the database connection
  │     db.close()
  │
  ├─ 3. Remove WAL and SHM journal files
  │     sekel.db-wal, sekel.db-shm
  │
  ├─ 4. Copy backup file over sekel.db
  │     fs.copyFileSync(backupFilePath, dbPath)
  │
  └─ 5. Reinitialize database connection
        initDatabase()  ← reopens sekel.db, sets pragmas, runs migrations
  ↓
RestoreResult { success: true, safetyBackup: BackupInfo }
  ↓
Toast: "Restore successful"
Backup list refreshed
```

**Important:** `initDatabase()` in `db/index.ts` was updated to safely close any existing connection before reopening, enabling the restore flow to work without restarting the app.

---

## 3. Native .sekel Export/Import

### Why Not Just .apkg?

The existing `.apkg` export only works for cards with `anki_id IS NOT NULL` — meaning only Anki-imported cards can be exported. Cards created natively in Sekel have no export path. The `.sekel` format exports everything.

### .sekel File Format

A `.sekel` file is a **ZIP archive** (built with JSZip) containing:

```
mydecks.sekel (ZIP)
├── collection.json     — format version, export date, app version, optional deckId
├── decks.json          — all exported decks
├── note_types.json     — all note types for the user
├── notes.json          — notes scoped to exported decks
├── cards.json          — cards scoped to exported notes
├── reviews.json        — reviews scoped to exported cards
├── sessions.json       — deck sessions scoped to exported decks
├── media.json          — media table metadata (if includeMedia=true)
└── media/              — actual media files (if includeMedia=true)
    ├── abc123.jpg
    └── def456.mp3
```

`collection.json` schema:
```json
{
    "formatVersion": 1,
    "exportDate": "2026-03-26T10:30:00.000Z",
    "appVersion": "1.8.0",
    "deckId": "uuid-or-undefined"
}
```

### Export Flow

```
User opens ExportModal on a deck (or "Export Collection" from AccountTab)
  ↓
Select format: .sekel (default) or .apkg
  ↓
For .sekel: toggle "Include media files"
  ↓
exportAsSekel(userId, deckId | null, includeMedia)
  │
  ├─ Build default filename from deck name (or "sekel-collection")
  ├─ Show native save dialog with .sekel filter
  ├─ Query all data scoped to user + optional deck:
  │   decks → notes (by deck_id) → cards (by note_id, batched 500)
  │   → reviews (by card_id, batched 500) → sessions (by deck_id)
  │   → note_types (all for user)
  ├─ If includeMedia: read media files from disk, add to ZIP media/ folder
  ├─ Generate ZIP with DEFLATE compression
  └─ Write to chosen file path
  ↓
Return saved file path (or null if cancelled)
```

**Scope options:**
- `deckId = null` → entire collection (all decks for the user)
- `deckId = "some-uuid"` → single deck and its children

### Import Flow

```
User selects a .sekel file
  ↓
getSekelImportSummary(filePath)
  │
  ├─ Extract ZIP, read collection.json
  ├─ Count entities in each JSON file
  ├─ Check for media/ directory
  └─ Return SekelImportSummary (counts, deck names, format version)
  ↓
Summary shown to user for review
  ↓
importSekelFile(filePath, userId)
  │
  ├─ Parse all JSON files from ZIP
  │
  ├─ ID Remapping — ALL entities get new UUIDs:
  │   old deck ID    → new UUID (Map<string, string>)
  │   old note type  → new UUID
  │   old note ID    → new UUID
  │   old card ID    → new UUID
  │   old session ID → new UUID
  │   old review ID  → new UUID
  │
  ├─ Single SQLite transaction:
  │   1. Insert note_types  (remapped IDs, user_id overwritten)
  │   2. Insert decks       (remapped IDs + parent_id, user_id overwritten)
  │   3. Insert notes       (remapped IDs + deck_id + note_type_id)
  │   4. Insert cards       (remapped IDs + note_id)
  │   5. Insert reviews     (remapped IDs + card_id + session_id + deck_id)
  │   6. Insert sessions    (remapped IDs + deck_id)
  │
  ├─ Media extraction (outside transaction):
  │   Extract media/ files to {userData}/media/{sha1}{ext}
  │   SHA1 dedup (skip if file already exists on disk)
  │   Insert media table rows
  │
  └─ Return SekelImportResult (counts of inserted entities)
```

**Why remap IDs?** UUIDs generated on one device will never collide with another, but importing a backup on the same device (or importing twice) would create duplicates. Fresh UUIDs ensure safe re-import.

### Format Selection UI

The ExportModal presents two format options as visual cards:

| Format | When to Use | Notes |
|--------|------------|-------|
| `.sekel` (default) | All Sekel data, portable backups, sharing | Includes FSRS state, reviews, sessions, optional media |
| `.apkg` | Sharing with Anki users | Only available when deck has Anki-imported cards (`anki_id IS NOT NULL`) |

---

## 4. Deletion Safety

### Problem

Deleting a deck or note is a hard `DELETE` with cascading removals. All child notes, cards, reviews, and sessions are permanently destroyed with no recovery path.

### Solution: JSONL Deletion Log

Before every hard delete, the full entity data is captured and appended to `{userData}/deleted_items.jsonl`.

```
deleteDeck(id) in service.ts
  ↓
logDeckDeletion(id) in deletionLog.ts
  │
  ├─ Query full deck row
  ├─ Count child notes, cards, reviews, sessions
  ├─ Serialize to JSON with timestamp and type
  ├─ Append to deleted_items.jsonl
  └─ Auto-prune entries > 90 days
  ↓
Proceed with actual DELETE
```

Same pattern for `deleteNote(id)` — captures the note and its cards.

**Log format** (one JSON object per line):
```json
{"type":"deck","id":"uuid","timestamp":"2026-03-26T10:30:00.000Z","data":{"id":"uuid","name":"My Deck",...},"meta":{"noteCount":15,"cardCount":30,"reviewCount":250,"sessionCount":5}}
```

**Viewing deleted items:** Accessible via `db:getDeletedItems` IPC, which reads and parses the JSONL file, returning entries sorted newest first.

**Retention:** Entries older than 90 days are pruned on each write to prevent unbounded growth.

---

## 5. Database Integrity Check

Accessible from the Backup tab in the Profile page.

```
User clicks "Check Database"
  ↓
db:checkIntegrity IPC handler
  │
  ├─ PRAGMA integrity_check    → returns "ok" or error details
  └─ PRAGMA foreign_key_check  → returns empty if FK constraints satisfied
  ↓
If both pass: result = "ok"
If either fails: result = error detail string
  ↓
UI shows green "Database is healthy" or red error message
```

---

## 6. UI Entry Points

### Backup Tab (Profile > Backup)

Three sections:

1. **Backup Actions** — "Create Backup Now" button, scrollable list of backups with timestamp/size, per-backup Restore and Delete buttons
2. **Backup Schedule** — interval selector, daily/weekly/monthly retention dropdowns
3. **Database Integrity** — "Check Database" button with pass/fail indicator

### Export Modal (Deck > Export)

Format selector (`.sekel` or `.apkg`), media toggle for .sekel, export button.

### Account Tab (Profile > Account)

"Export Collection" button in Data Management section — exports entire collection as `.sekel` with media.

### File Menu

- **Create Backup** (`CmdOrCtrl+Shift+B`)
- **Restore from Backup...**

---

## Comparison with Anki

| Feature | Anki | Sekel |
|---------|------|-------|
| Automatic periodic backups | 30min default | 30min default, configurable |
| Backup restore UI | Switch Profile > Open Backup | Profile > Backup tab |
| Manual backup | File > Create Backup | File > Create Backup (`CmdOrCtrl+Shift+B`) |
| Full export with media | .colpkg | .sekel (ZIP with JSON + media) |
| Backup retention policy | Daily/weekly/monthly | Daily/weekly/monthly, configurable |
| Backup preferences UI | In preferences | Profile > Backup tab |
| Database integrity check | Tools > Check Database | Profile > Backup tab |
| Deletion log | deleted.txt | deleted_items.jsonl (90-day retention) |
| Cloud sync as backup | AnkiWeb | Deferred (future paid feature) |

---

## Key Decisions

1. **`.backup()` over file copy** — WAL-mode databases can have active WAL files. `better-sqlite3`'s `.backup()` API creates a consistent snapshot regardless of WAL state.

2. **JSON over SQLite dump for .sekel format** — JSON is more portable, human-inspectable, version-tolerant, and we already have TypeScript types for all entities.

3. **ID remapping on import** — All entities get fresh UUIDs during .sekel import to avoid collisions. A `Map<oldId, newId>` tracks remappings so foreign keys are correctly rewritten.

4. **Deletion log over soft delete** — A JSONL append log is simpler than adding `deleted_at` columns to every table and modifying all queries. Matches Anki's approach.

5. **Batched queries for export** — Cards and reviews are queried in chunks of 500 to avoid SQLite's maximum variable placeholder limit.

6. **Local-only backup settings** — Backup interval and retention are device-specific, so they're stored in memory (not Supabase). Defaults are applied on each app start.

7. **Safety backup before restore** — A backup of the current database is always created before overwriting with a restore, giving the user a way to undo.
