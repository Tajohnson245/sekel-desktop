-- Add background_url column to user_profiles for custom background images
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS background_url text;

-- Create backgrounds storage bucket (public read, authenticated upload)
INSERT INTO storage.buckets (id, name, public)
VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Background images are publicly accessible."
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backgrounds');

CREATE POLICY "Authenticated users can upload background images."
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'backgrounds' AND auth.role() = 'authenticated');
