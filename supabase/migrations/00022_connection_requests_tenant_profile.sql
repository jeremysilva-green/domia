-- Add tenant profile fields to connection_requests so they are captured at request time
-- and available when the owner approves (without needing a separate profile table)
ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS tenant_ruc text,
  ADD COLUMN IF NOT EXISTS tenant_razon_social text;
