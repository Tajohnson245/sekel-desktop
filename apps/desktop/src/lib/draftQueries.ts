/**
 * Client-bound shim — wraps window.electronAPI.db draft IPC calls so callers
 * don't need to import or use IPC directly. No other file needs to change its imports.
 */

import type { DraftCardInsert, DraftCard } from '@sekel/db';

const db = () => window.electronAPI.db;

export const fetchDrafts = (userId: string) => db().fetchDrafts(userId);
export const saveDraft = (userId: string, draft: DraftCardInsert) => db().saveDraft(userId, draft);
export const updateDraft = (id: string, updates: Partial<Pick<DraftCard, 'front' | 'back'>>) => db().updateDraft(id, updates);
export const deleteDraft = (id: string) => db().deleteDraft(id);
export const clearDrafts = (userId: string) => db().clearDrafts(userId);
