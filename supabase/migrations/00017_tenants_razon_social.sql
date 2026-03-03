-- Add razon_social column to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS razon_social text;
