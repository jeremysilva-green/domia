-- SECURITY DEFINER function that resolves the real tenants.id for the
-- currently authenticated tenant user. Runs as superuser, bypassing RLS.
-- Falls back through three strategies so it handles all owner-created tenant scenarios.

CREATE OR REPLACE FUNCTION get_my_tenant_record_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- 1. Direct: tenant signed up themselves (tenants.id = auth.uid())
  SELECT id INTO v_id FROM tenants WHERE id = auth.uid() LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Via unit_id: connection_request links auth user to tenant record via shared unit
  SELECT t.id INTO v_id
  FROM tenants t
  INNER JOIN connection_requests cr
    ON cr.unit_id = t.unit_id
    AND cr.owner_id = t.owner_id
  WHERE cr.tenant_id = auth.uid()
    AND cr.status = 'approved'
    AND t.unit_id IS NOT NULL
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 3. Via email: owner created tenant with same email as the auth user
  SELECT t.id INTO v_id
  FROM tenants t
  INNER JOIN connection_requests cr
    ON cr.owner_id = t.owner_id
    AND LOWER(cr.tenant_email) = LOWER(t.email)
  WHERE cr.tenant_id = auth.uid()
    AND cr.status = 'approved'
  LIMIT 1;

  RETURN v_id; -- NULL if no match (caller should handle)
END;
$$;

-- Rebuild rent_payments INSERT/UPDATE policies to use the function
DROP POLICY IF EXISTS "Tenants can insert payment records" ON rent_payments;
DROP POLICY IF EXISTS "Tenants can update payment records" ON rent_payments;

CREATE POLICY "Tenants can insert payment records"
  ON rent_payments FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_record_id());

CREATE POLICY "Tenants can update payment records"
  ON rent_payments FOR UPDATE
  TO authenticated
  USING (tenant_id = get_my_tenant_record_id())
  WITH CHECK (tenant_id = get_my_tenant_record_id());
