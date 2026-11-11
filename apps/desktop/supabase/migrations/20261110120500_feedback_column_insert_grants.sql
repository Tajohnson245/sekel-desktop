-- SEKEL-146: clients can no longer choose their own feedback.ticket_number
-- (or id / created_at).
--
-- The insert policy only checks auth.uid() = user_id. With the default
-- table-wide INSERT grant, a user could send ticket_number explicitly and
-- claim future Feedback-NNN values. Because of the UNIQUE constraint, that
-- would make the real submissions that later draw those numbers from the
-- sequence fail.
--
-- Fix: column-level INSERT privileges. Revoke the table-wide grant and grant
-- INSERT only on the columns released clients actually send. This list is
-- the union of the insertFeedback() payloads in FeedbackSection.tsx at every
-- desktop/v* release tag (v1.0.0 - v2.0.0):
--   v1.0.0 - v1.0.6: user_id, areas, description, screenshot_url,
--                    desired_fix, os, mac_chip
--   v1.0.7 - v2.0.0: the above + type, summary, app_version
-- PostgREST only names the columns present in the JSON body, so these
-- payloads keep working. id, created_at and ticket_number fall back to their
-- defaults. SELECT is unchanged, so insert(...).select() still returns the
-- full row.
--
-- IMPORTANT for future migrations: a new feedback column the client sends
-- needs its own `grant insert (<col>) on public.feedback to authenticated;`
-- or every submission that includes it fails with "permission denied".
--
-- anon gets nothing: the RLS check auth.uid() = user_id can never pass
-- without a session anyway. service_role keeps full access (admin dashboard,
-- edge functions).

revoke insert on table public.feedback from anon, authenticated;

grant insert (
    user_id,
    type,
    summary,
    areas,
    description,
    screenshot_url,
    desired_fix,
    os,
    mac_chip,
    app_version
) on table public.feedback to authenticated;
