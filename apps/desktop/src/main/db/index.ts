import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { MIGRATIONS } from './migrations';

let db: Database.Database;

export function initDatabase(): Database.Database {
    const dbPath = path.join(app.getPath('userData'), 'sekel.db');
    db = new Database(dbPath);

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db);
    return db;
}

export function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

function runMigrations(database: Database.Database): void {
    database.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
    `);

    const row = database.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
    const currentVersion = row.v ?? 0;

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
        const applyMigration = database.transaction(() => {
            database.exec(MIGRATIONS[i]);
            database.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
        });
        applyMigration();
        console.log(`[DB] Applied migration ${i + 1}`);
    }
}
