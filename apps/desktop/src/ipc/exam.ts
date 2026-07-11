import { instrumentedHandle } from '@sekel/observability';
import { getDb } from '../main/db/index';

const EXAM_DATE_SENTINEL = '9999-12-31';

export function setupExamHandlers(): void {

    instrumentedHandle('exam:list-exams', () => {
        return getDb().prepare(
            'SELECT id, exam_key, label FROM blueprint_exams ORDER BY label'
        ).all();
    });

    instrumentedHandle('exam:get-profile', (_e, userId: string) => {
        return getDb().prepare(`
            SELECT uep.*, be.exam_key, be.label AS exam_label
            FROM user_exam_profiles uep
            JOIN blueprint_exams be ON be.id = uep.exam_id
            WHERE uep.user_id = ? AND uep.is_primary = 1
        `).get(userId) ?? null;
    });

    instrumentedHandle('exam:upsert-profile',
        (_e, userId: string, examId: number, examDate: string | null, sessionMode?: string) => {
            const db = getDb();
            const now = new Date().toISOString();
            const dateValue = examDate ?? EXAM_DATE_SENTINEL;
            const mode = sessionMode ?? 'auto';

            db.transaction(() => {
                // If this is a SWITCH to a different exam (not just a date/mode update
                // to the same exam), archive the OUTGOING primary exam's active plans.
                // getActivePlan resolves via is_primary, so a plan left active on the
                // old exam would otherwise become a hidden orphan (and resurface if the
                // user switches back). Mirrors exam:delete-profile's archival.
                const currentPrimary = db.prepare(
                    'SELECT exam_id FROM user_exam_profiles WHERE user_id = ? AND is_primary = 1'
                ).get(userId) as { exam_id: number } | undefined;
                if (currentPrimary && currentPrimary.exam_id !== examId) {
                    db.prepare(`
                        UPDATE plans SET status = 'archived', updated_at = ?
                        WHERE user_id = ? AND status = 'active'
                          AND exam_key = (SELECT exam_key FROM blueprint_exams WHERE id = ?)
                    `).run(now, userId, currentPrimary.exam_id);
                }

                db.prepare(
                    'UPDATE user_exam_profiles SET is_primary = 0, updated_at = ? WHERE user_id = ? AND is_primary = 1'
                ).run(now, userId);

                db.prepare(`
                    INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                    VALUES (?, ?, ?, 1, ?, ?, ?)
                    ON CONFLICT(user_id, exam_id) DO UPDATE SET
                        exam_date    = excluded.exam_date,
                        is_primary   = 1,
                        session_mode = excluded.session_mode,
                        updated_at   = excluded.updated_at
                `).run(userId, examId, dateValue, mode, now, now);
            })();

            return db.prepare(`
                SELECT uep.*, be.exam_key, be.label AS exam_label
                FROM user_exam_profiles uep
                JOIN blueprint_exams be ON be.id = uep.exam_id
                WHERE uep.user_id = ? AND uep.exam_id = ?
            `).get(userId, examId);
        }
    );

    instrumentedHandle('exam:update-profile',
        (_e, userId: string, updates: { exam_date?: string; session_mode?: string }) => {
            const db = getDb();
            const now = new Date().toISOString();
            const setClauses: string[] = ['updated_at = ?'];
            const params: unknown[] = [now];

            if (updates.exam_date !== undefined) {
                setClauses.push('exam_date = ?');
                params.push(updates.exam_date || EXAM_DATE_SENTINEL);
            }
            if (updates.session_mode !== undefined) {
                setClauses.push('session_mode = ?');
                params.push(updates.session_mode);
            }
            params.push(userId);

            db.prepare(
                `UPDATE user_exam_profiles SET ${setClauses.join(', ')} WHERE user_id = ? AND is_primary = 1`
            ).run(...params);

            return db.prepare(`
                SELECT uep.*, be.exam_key, be.label AS exam_label
                FROM user_exam_profiles uep
                JOIN blueprint_exams be ON be.id = uep.exam_id
                WHERE uep.user_id = ? AND uep.is_primary = 1
            `).get(userId) ?? null;
        }
    );

    instrumentedHandle('exam:delete-profile', (_e, userId: string) => {
        const db = getDb();
        const now = new Date().toISOString();
        db.transaction(() => {
            // Archive any active plans for this user's primary exam in the same
            // transaction as the profile delete, so we never leave an orphaned
            // active plan pointing at a removed exam profile.
            db.prepare(`
                UPDATE plans SET status = 'archived', updated_at = ?
                WHERE user_id = ? AND status = 'active'
                  AND exam_key IN (
                      SELECT be.exam_key
                      FROM user_exam_profiles uep
                      JOIN blueprint_exams be ON be.id = uep.exam_id
                      WHERE uep.user_id = ? AND uep.is_primary = 1
                  )
            `).run(now, userId, userId);
            db.prepare(
                'DELETE FROM user_exam_profiles WHERE user_id = ? AND is_primary = 1'
            ).run(userId);
        })();
    });

    instrumentedHandle('exam:fetch-all-card-ids', (_e, userId: string) => {
        const rows = getDb().prepare(
            'SELECT id FROM cards WHERE user_id = ?'
        ).all(userId) as Array<{ id: string }>;
        return rows.map(r => r.id);
    });
}
