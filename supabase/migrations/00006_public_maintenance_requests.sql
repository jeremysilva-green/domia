-- Migration: Add owner_id to maintenance_requests for public submissions
-- This allows tenants to submit maintenance requests via public link without being registered

-- Add owner_id column to maintenance_requests
ALTER TABLE maintenance_requests
ADD COLUMN owner_id UUID REFERENCES owners(id) ON DELETE CASCADE;

-- Make tenant_id nullable for public submissions
ALTER TABLE maintenance_requests
ALTER COLUMN tenant_id DROP NOT NULL;

-- Add submitter info columns for public submissions
ALTER TABLE maintenance_requests
ADD COLUMN submitter_name TEXT,
ADD COLUMN submitter_phone TEXT;

-- Create index for owner_id lookups
CREATE INDEX idx_maintenance_owner ON maintenance_requests(owner_id);

-- Update RLS policy to allow public inserts with owner_id
CREATE POLICY "Allow public maintenance submissions"
ON maintenance_requests
FOR INSERT
TO anon
WITH CHECK (owner_id IS NOT NULL);

-- Update RLS policy to allow owners to view their maintenance requests
DROP POLICY IF EXISTS "Owners can view maintenance for their tenants" ON maintenance_requests;
CREATE POLICY "Owners can view maintenance for their tenants or direct submissions"
ON maintenance_requests
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR tenant_id IN (
    SELECT id FROM tenants WHERE owner_id = auth.uid()
  )
);

-- Allow owners to update maintenance requests (for changing status, etc.)
DROP POLICY IF EXISTS "Owners can update maintenance for their tenants" ON maintenance_requests;
CREATE POLICY "Owners can update their maintenance requests"
ON maintenance_requests
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR tenant_id IN (
    SELECT id FROM tenants WHERE owner_id = auth.uid()
  )
);
