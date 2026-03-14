-- Add tenant_phone to disconnection_requests so owner can WhatsApp the tenant
ALTER TABLE disconnection_requests
  ADD COLUMN IF NOT EXISTS tenant_phone text;
