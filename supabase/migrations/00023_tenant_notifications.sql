-- Track unseen updates for tenant notification badge
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS seen_by_tenant boolean DEFAULT true;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lease_seen_by_tenant boolean DEFAULT true;
