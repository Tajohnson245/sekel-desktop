-- Create the 'card-media' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-media', 'card-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public read access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'card-media' );

-- Policy to allow authenticated uploads to 'card-media'
CREATE POLICY "Authenticated users can upload media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow authenticated users to delete their own media
CREATE POLICY "Authenticated users can delete their own media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
