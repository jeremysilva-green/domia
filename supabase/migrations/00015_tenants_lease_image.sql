-- Add lease_image_url column to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lease_image_url text;
