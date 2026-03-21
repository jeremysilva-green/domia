-- Fix rent_payments RLS so tenants can insert/update payment records
-- even when tenants.id was created by the owner (≠ auth.uid()).
-- Looks up the real tenant record via the approved connection_request.

DROP POLICY IF EXISTS "Tenants can insert their own payment records" ON rent_payments;
DROP POLICY IF EXISTS "Tenants can update their own payment proof" ON rent_payments;

-- INSERT: allow if tenant_id matches auth.uid() OR if it's the tenant record
-- linked to the authenticated user's approved connection request.
CREATE POLICY "Tenants can insert payment records"
  ON rent_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = auth.uid()
    OR tenant_id IN (
      SELECT t.id FROM tenants t
      INNER JOIN connection_requests cr
        ON cr.unit_id = t.unit_id
        AND cr.owner_id = t.owner_id
      WHERE cr.tenant_id = auth.uid()
        AND cr.status = 'approved'
    )
  );

-- UPDATE: same logic for both USING and WITH CHECK
CREATE POLICY "Tenants can update payment records"
  ON rent_payments FOR UPDATE
  TO authenticated
  USING (
    tenant_id = auth.uid()
    OR tenant_id IN (
      SELECT t.id FROM tenants t
      INNER JOIN connection_requests cr
        ON cr.unit_id = t.unit_id
        AND cr.owner_id = t.owner_id
      WHERE cr.tenant_id = auth.uid()
        AND cr.status = 'approved'
    )
  )
  WITH CHECK (
    tenant_id = auth.uid()
    OR tenant_id IN (
      SELECT t.id FROM tenants t
      INNER JOIN connection_requests cr
        ON cr.unit_id = t.unit_id
        AND cr.owner_id = t.owner_id
      WHERE cr.tenant_id = auth.uid()
        AND cr.status = 'approved'
    )
  );
