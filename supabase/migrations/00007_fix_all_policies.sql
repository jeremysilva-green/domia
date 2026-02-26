-- ============================================
-- COMPLETE FIX FOR ALL RLS POLICIES
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CONNECTION REQUESTS TABLE
-- ============================================

-- Create table if not exists
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first
DROP POLICY IF EXISTS "Owners can view their connection requests" ON connection_requests;
DROP POLICY IF EXISTS "Tenants can view their own requests" ON connection_requests;
DROP POLICY IF EXISTS "Tenants can create connection requests" ON connection_requests;
DROP POLICY IF EXISTS "Owners can update connection requests" ON connection_requests;

-- Recreate policies
CREATE POLICY "Owners can view their connection requests"
ON connection_requests FOR SELECT TO authenticated
USING (owner_id IN (SELECT id FROM owners WHERE id = auth.uid()));

CREATE POLICY "Tenants can view their own requests"
ON connection_requests FOR SELECT TO authenticated
USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can create connection requests"
ON connection_requests FOR INSERT TO authenticated
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Owners can update connection requests"
ON connection_requests FOR UPDATE TO authenticated
USING (owner_id IN (SELECT id FROM owners WHERE id = auth.uid()));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_connection_requests_owner ON connection_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_tenant ON connection_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_status ON connection_requests(status);

-- ============================================
-- 2. OWNERS TABLE - Allow tenants to view owners
-- ============================================

DROP POLICY IF EXISTS "Owners can view own profile" ON owners;
DROP POLICY IF EXISTS "Authenticated users can view owner profiles" ON owners;

CREATE POLICY "Authenticated users can view owner profiles"
ON owners FOR SELECT TO authenticated
USING (true);

-- ============================================
-- 3. MAINTENANCE REQUESTS - Add owner_id support
-- ============================================

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'maintenance_requests' AND column_name = 'owner_id') THEN
    ALTER TABLE maintenance_requests ADD COLUMN owner_id UUID REFERENCES owners(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'maintenance_requests' AND column_name = 'submitter_name') THEN
    ALTER TABLE maintenance_requests ADD COLUMN submitter_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'maintenance_requests' AND column_name = 'submitter_phone') THEN
    ALTER TABLE maintenance_requests ADD COLUMN submitter_phone TEXT;
  END IF;
END $$;

-- Make tenant_id nullable
ALTER TABLE maintenance_requests ALTER COLUMN tenant_id DROP NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_maintenance_owner ON maintenance_requests(owner_id);

-- Drop and recreate maintenance policies
DROP POLICY IF EXISTS "Allow public maintenance submissions" ON maintenance_requests;
DROP POLICY IF EXISTS "Owners can view maintenance for their tenants" ON maintenance_requests;
DROP POLICY IF EXISTS "Owners can view maintenance for their tenants or direct submissions" ON maintenance_requests;
DROP POLICY IF EXISTS "Owners can update maintenance for their tenants" ON maintenance_requests;
DROP POLICY IF EXISTS "Owners can update their maintenance requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Tenants can create maintenance requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Tenants can view their maintenance requests" ON maintenance_requests;

-- Allow anonymous users to submit maintenance via public link
CREATE POLICY "Allow public maintenance submissions"
ON maintenance_requests FOR INSERT TO anon
WITH CHECK (owner_id IS NOT NULL);

-- Owners can view all maintenance (their tenants + direct submissions)
CREATE POLICY "Owners can view maintenance for their tenants or direct submissions"
ON maintenance_requests FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid())
);

-- Owners can update maintenance requests
CREATE POLICY "Owners can update their maintenance requests"
ON maintenance_requests FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid())
);

-- Tenants can create their own maintenance requests
CREATE POLICY "Tenants can create maintenance requests"
ON maintenance_requests FOR INSERT TO authenticated
WITH CHECK (tenant_id = auth.uid());

-- Tenants can view their own requests
CREATE POLICY "Tenants can view their maintenance requests"
ON maintenance_requests FOR SELECT TO authenticated
USING (tenant_id = auth.uid());

-- ============================================
-- 4. TENANTS TABLE - Allow tenant self-management
-- ============================================

DROP POLICY IF EXISTS "Tenants can insert own record" ON tenants;
DROP POLICY IF EXISTS "Tenants can view own record" ON tenants;
DROP POLICY IF EXISTS "Owners can view their tenants" ON tenants;
DROP POLICY IF EXISTS "Owners can manage their tenants" ON tenants;

-- Owners can view and manage their tenants
CREATE POLICY "Owners can view their tenants"
ON tenants FOR SELECT TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owners can manage their tenants"
ON tenants FOR ALL TO authenticated
USING (owner_id = auth.uid());

-- Tenants can view their own record
CREATE POLICY "Tenants can view own record"
ON tenants FOR SELECT TO authenticated
USING (id = auth.uid());

-- ============================================
-- DONE! All policies are now set up correctly.
-- ============================================

SELECT 'All policies created successfully!' as result;
