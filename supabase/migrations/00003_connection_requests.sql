-- Connection requests table for tenant-owner connections
CREATE TABLE IF NOT EXISTS connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  tenant_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, owner_id, status)
);

-- Add user_role to track if user is owner or tenant
-- This will be stored in user metadata during signup

-- Enable RLS
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;

-- Owners can see requests sent to them
CREATE POLICY "Owners can view their connection requests"
ON connection_requests
FOR SELECT
TO authenticated
USING (owner_id IN (SELECT id FROM owners WHERE id = auth.uid()));

-- Tenants can see their own requests
CREATE POLICY "Tenants can view their own requests"
ON connection_requests
FOR SELECT
TO authenticated
USING (tenant_id = auth.uid());

-- Tenants can create requests
CREATE POLICY "Tenants can create connection requests"
ON connection_requests
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = auth.uid());

-- Owners can update requests (approve/reject)
CREATE POLICY "Owners can update connection requests"
ON connection_requests
FOR UPDATE
TO authenticated
USING (owner_id IN (SELECT id FROM owners WHERE id = auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_connection_requests_owner ON connection_requests(owner_id);
CREATE INDEX idx_connection_requests_tenant ON connection_requests(tenant_id);
CREATE INDEX idx_connection_requests_status ON connection_requests(status);
