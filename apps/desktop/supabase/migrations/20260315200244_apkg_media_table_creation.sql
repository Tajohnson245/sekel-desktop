-- Media table: tracks imported media files (images, audio)
-- Media is a shared pool per user, looked up by filename during card rendering
CREATE TABLE IF NOT EXISTS media (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text NOT NULL,
  file_path text NOT NULL,
  file_hash text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT media_pkey PRIMARY KEY (id),
  CONSTRAINT media_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Lookup index: find media by filename for a given user (card rendering)
CREATE INDEX IF NOT EXISTS idx_media_user_filename
ON media (user_id, filename);

-- Dedup index: prevent duplicate files per user on re-import
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_user_file_hash
ON media (user_id, file_hash);