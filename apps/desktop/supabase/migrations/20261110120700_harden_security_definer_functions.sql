-- SEKEL-146: give SECURITY DEFINER functions a fixed search_path, and stop
-- anon from calling delete_own_account().
--
-- A SECURITY DEFINER function that resolves names through the caller's
-- search_path can be tricked into calling objects the caller controls. Both
-- function bodies below already schema-qualify every relation
-- (auth.users / auth.uid(), public.card_drafts). Builtins like count() come
-- from pg_catalog, which is always searched. So an empty search_path doesn't
-- change their behaviour.
--
-- delete_own_account() was created in public by 20260212040000 and is
-- EXECUTE-able by PUBLIC (Postgres default) and anon (Supabase default
-- privileges). For anon, auth.uid() is NULL so the call is a no-op, but
-- there's no reason to expose it. authenticated keeps its explicit grant:
-- shipped clients call this RPC, and the new client falls back to it.

alter function public.delete_own_account() set search_path = '';
alter function public.check_draft_limit() set search_path = '';

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
