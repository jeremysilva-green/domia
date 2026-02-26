-- Domus Property Management MVP - Initial Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Owners table (property owners/landlords)
CREATE TABLE owners (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties table
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'condo', 'commercial')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_id);

-- Units table (apartments/units within properties)
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  bedrooms INTEGER DEFAULT 1,
  bathrooms NUMERIC(2,1) DEFAULT 1,
  rent_amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, unit_number)
);

CREATE INDEX idx_units_property ON units(property_id);

-- Tenants table with public access tokens
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,

  -- Public access tokens (no auth required)
  portal_token UUID UNIQUE DEFAULT gen_random_uuid(),
  onboarding_token UUID UNIQUE DEFAULT gen_random_uuid(),
  onboarding_completed BOOLEAN DEFAULT FALSE,

  -- Profile
  full_name TEXT,
  email TEXT,
  phone TEXT,

  -- Lease details
  rent_amount NUMERIC(10,2),
  lease_start DATE,
  lease_end DATE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_owner ON tenants(owner_id);
CREATE INDEX idx_tenants_unit ON tenants(unit_id);
CREATE INDEX idx_tenants_portal_token ON tenants(portal_token);
CREATE INDEX idx_tenants_onboarding_token ON tenants(onboarding_token);

-- Rent payments table
CREATE TABLE rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Period tracking
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,

  -- Payment details
  amount_due NUMERIC(10,2) NOT NULL,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Status
  status TEXT DEFAULT 'due' CHECK (status IN ('paid', 'due', 'late', 'partial')),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, period_month, period_year)
);

CREATE INDEX idx_rent_payments_tenant ON rent_payments(tenant_id);
CREATE INDEX idx_rent_payments_status ON rent_payments(status);
CREATE INDEX idx_rent_payments_period ON rent_payments(period_year, period_month);

-- Maintenance requests table
CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,

  -- Request details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'other')),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'emergency')),

  -- Status tracking
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_progress', 'completed', 'cancelled')),

  -- Owner tracking
  estimated_cost NUMERIC(10,2),
  actual_cost NUMERIC(10,2),
  owner_notes TEXT,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maintenance_tenant ON maintenance_requests(tenant_id);
CREATE INDEX idx_maintenance_unit ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);

-- Maintenance images table
CREATE TABLE maintenance_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maintenance_images_request ON maintenance_images(maintenance_request_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_images ENABLE ROW LEVEL SECURITY;

-- Owners policies
CREATE POLICY "Owners can view own profile"
  ON owners FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Owners can update own profile"
  ON owners FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Owners can insert own profile"
  ON owners FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Properties policies
CREATE POLICY "Owners can CRUD own properties"
  ON properties FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Units policies
CREATE POLICY "Owners can CRUD units via property ownership"
  ON units FOR ALL
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()
    )
  );

-- Tenants policies (owner access)
CREATE POLICY "Owners can CRUD own tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Tenants policies (public access via tokens)
CREATE POLICY "Public can view tenant via portal token"
  ON tenants FOR SELECT
  TO anon
  USING (portal_token IS NOT NULL);

CREATE POLICY "Public can update via onboarding token"
  ON tenants FOR UPDATE
  TO anon
  USING (onboarding_token IS NOT NULL AND onboarding_completed = FALSE)
  WITH CHECK (onboarding_token IS NOT NULL AND onboarding_completed = FALSE);

-- Rent payments policies (owner access)
CREATE POLICY "Owners can CRUD rent payments"
  ON rent_payments FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  );

-- Rent payments policies (public read via portal)
CREATE POLICY "Public can view own rent history"
  ON rent_payments FOR SELECT
  TO anon
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE portal_token IS NOT NULL
    )
  );

-- Maintenance requests policies (owner access)
CREATE POLICY "Owners can CRUD maintenance requests"
  ON maintenance_requests FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  );

-- Maintenance requests policies (public access)
CREATE POLICY "Public can submit maintenance via portal"
  ON maintenance_requests FOR INSERT
  TO anon
  WITH CHECK (
    tenant_id IN (
      SELECT id FROM tenants WHERE portal_token IS NOT NULL
    )
  );

CREATE POLICY "Public can view own maintenance requests"
  ON maintenance_requests FOR SELECT
  TO anon
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE portal_token IS NOT NULL
    )
  );

-- Maintenance images policies
CREATE POLICY "Owners can view maintenance images"
  ON maintenance_images FOR SELECT
  TO authenticated
  USING (
    maintenance_request_id IN (
      SELECT id FROM maintenance_requests WHERE tenant_id IN (
        SELECT id FROM tenants WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Public can upload maintenance images"
  ON maintenance_images FOR INSERT
  TO anon
  WITH CHECK (
    maintenance_request_id IN (
      SELECT id FROM maintenance_requests WHERE tenant_id IN (
        SELECT id FROM tenants WHERE portal_token IS NOT NULL
      )
    )
  );

CREATE POLICY "Public can view own maintenance images"
  ON maintenance_images FOR SELECT
  TO anon
  USING (
    maintenance_request_id IN (
      SELECT id FROM maintenance_requests WHERE tenant_id IN (
        SELECT id FROM tenants WHERE portal_token IS NOT NULL
      )
    )
  );

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Create storage bucket for maintenance images
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-images', 'maintenance-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can upload maintenance images"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'maintenance-images');

CREATE POLICY "Anyone can view maintenance images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'maintenance-images');

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_owners_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rent_payments_updated_at
  BEFORE UPDATE ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update unit status when tenant is assigned/removed
CREATE OR REPLACE FUNCTION update_unit_occupancy()
RETURNS TRIGGER AS $$
BEGIN
  -- When tenant is activated with a unit
  IF NEW.status = 'active' AND NEW.unit_id IS NOT NULL THEN
    UPDATE units SET status = 'occupied' WHERE id = NEW.unit_id;
  END IF;

  -- When tenant is deactivated or removed from unit
  IF (OLD.status = 'active' AND NEW.status != 'active') OR
     (OLD.unit_id IS NOT NULL AND NEW.unit_id IS NULL) THEN
    UPDATE units SET status = 'vacant' WHERE id = OLD.unit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_unit_on_tenant_change
  AFTER UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_unit_occupancy();
