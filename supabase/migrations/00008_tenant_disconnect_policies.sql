-- Allow tenants to delete their own connection requests (needed for disconnect)
CREATE POLICY "Tenants can delete their own requests"
ON connection_requests FOR DELETE TO authenticated
USING (tenant_id = auth.uid());

-- Allow tenants to delete their own tenant record (needed for disconnect)
CREATE POLICY "Tenants can delete own record"
ON tenants FOR DELETE TO authenticated
USING (id = auth.uid());

-- Allow tenants to mark their assigned unit as vacant (needed for disconnect)
-- The USING clause verifies the tenant is currently assigned to that unit
CREATE POLICY "Tenants can vacate their assigned unit"
ON units FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT unit_id FROM tenants
    WHERE id = auth.uid() AND unit_id IS NOT NULL
  )
)
WITH CHECK (status = 'vacant');
