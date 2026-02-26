-- Add profile_image_url to tenants table so owners can see tenant profile photos
-- (e.g. on maintenance request cards)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Allow tenants to update their own record (needed to sync profile image)
CREATE POLICY "Tenants can update own record"
  ON tenants FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
