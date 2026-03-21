-- Allow a tenant user to SELECT the tenant record linked to their
-- approved connection request, even when tenants.id ≠ auth.uid().
-- This is needed so the app can resolve the real tenant ID before
-- inserting/updating rent_payments.

CREATE POLICY "Tenants can view their connected tenant record"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM connection_requests cr
      WHERE cr.unit_id = tenants.unit_id
        AND cr.owner_id = tenants.owner_id
        AND cr.tenant_id = auth.uid()
        AND cr.status = 'approved'
    )
  );
