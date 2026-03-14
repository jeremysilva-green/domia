-- Disconnection requests: tenant fills a reason form before leaving.
-- The record persists after the tenant disconnects so the owner can review it.
CREATE TABLE disconnection_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,        -- auth.uid() at time of submit
  owner_id uuid NOT NULL,
  tenant_name text NOT NULL,
  tenant_email text NOT NULL,
  unit_info text,                 -- e.g. "Apt 3 · Torre Sol"
  reason text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE disconnection_requests ENABLE ROW LEVEL SECURITY;

-- Tenants can insert (before they disconnect)
CREATE POLICY "Tenants can insert disconnection requests"
  ON disconnection_requests FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth.uid());

-- Owners can read requests directed at them
CREATE POLICY "Owners can read their disconnection requests"
  ON disconnection_requests FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Owners can acknowledge
CREATE POLICY "Owners can acknowledge disconnection requests"
  ON disconnection_requests FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());
