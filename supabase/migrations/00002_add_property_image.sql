-- Add image_url column to properties table
ALTER TABLE properties
ADD COLUMN image_url TEXT;

-- Create storage bucket for property images
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to property-images bucket
CREATE POLICY "Allow authenticated uploads to property-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-images');

-- Allow public access to property images
CREATE POLICY "Allow public access to property-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-images');

-- Allow owners to update/delete their property images
CREATE POLICY "Allow authenticated updates to property-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'property-images');

CREATE POLICY "Allow authenticated deletes from property-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'property-images');
