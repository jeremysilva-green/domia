-- Add property_id to connection_requests so each request is tied to a specific property
ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE CASCADE;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_connection_requests_property ON connection_requests(property_id);

-- Drop the old unique constraint that was per-owner (allowed only one request per owner/status)
ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS connection_requests_tenant_id_owner_id_status_key;

-- New constraint: one request per tenant per property (NULLs don't conflict, so old rows are unaffected)
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_tenant_property_unique UNIQUE (tenant_id, property_id);
