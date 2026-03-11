/**
 * Client-bound shim — wraps @sekel/db card_draft functions with the local supabase instance
 * so callers don't need to pass a client. No other file needs to change its imports.
 */

import { supabase } from './supabase';
import * as db from '@sekel/db';

export const fetchDrafts = () => db.fetchDrafts(supabase);
export const saveDraft = (draft: db.DraftCardInsert) => db.saveDraft(supabase, draft);
export const updateDraft = (id: string, updates: Partial<Pick<db.DraftCard, 'front' | 'back'>>) => db.updateDraft(supabase, id, updates);
export const deleteDraft = (id: string) => db.deleteDraft(supabase, id);
export const clearDrafts = () => db.clearDrafts(supabase);
