-- SEKEL-146: stop anyone from listing the public buckets.
--
-- Four broad SELECT policies on storage.objects (no role, USING only on
-- bucket_id) let anyone holding the shipped anon key call list()/search on
-- these buckets and enumerate every object: other users' feedback
-- screenshots, avatars and backgrounds, and the user ids embedded in the
-- object names.
--   "Avatar images are publicly accessible."        avatars               (20260212020000)
--   "Public Access"                                 card-media            (20260219000000)
--   "Feedback screenshots are publicly accessible." feedback-screenshots  (20260323120000)
--   "Background images are publicly accessible."    backgrounds           (20260323234315)
--
-- Why this doesn't break shipped clients (v1.0.0 - v2.0.0):
--   - Display: clients only use getPublicUrl() links
--     (/storage/v1/object/public/<bucket>/...). Supabase serves public-bucket
--     objects on that route without checking RLS. These buckets all stay
--     public = true.
--   - Upload: clients upload to avatars/backgrounds (upsert: true) and
--     feedback-screenshots. Storage may read the new row back
--     (INSERT ... RETURNING, or ON CONFLICT for upsert), which needs a SELECT
--     policy that matches the new row. Storage stamps the uploader's uid
--     into owner / owner_id, so the owner-scoped policy below matches
--     everything a user uploads.
--   - No shipped client calls list(), download() or createSignedUrl() on
--     these buckets, and none uses card-media at all.
-- INSERT/UPDATE/DELETE policies are untouched.

drop policy if exists "Avatar images are publicly accessible." on storage.objects;
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Feedback screenshots are publicly accessible." on storage.objects;
drop policy if exists "Background images are publicly accessible." on storage.objects;

drop policy if exists "Owners can read their own objects in public buckets" on storage.objects;
create policy "Owners can read their own objects in public buckets"
    on storage.objects for select
    to authenticated
    using (
        bucket_id in ('avatars', 'backgrounds', 'feedback-screenshots', 'card-media')
        and (
            owner = (select auth.uid())
            or owner_id = (select auth.uid())::text
        )
    );
