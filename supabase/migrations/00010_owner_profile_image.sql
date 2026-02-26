-- Add profile image URL to owners table
ALTER TABLE owners ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Create avatars storage bucket (public so images can be displayed without auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND name = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND name = auth.uid()::text);
