-- Allow tenants to SELECT the unit they are currently assigned to.
-- This is required so the tenant home page can display unit + property details
-- via the connection_requests join: unit:units(unit_number, property:properties(...))

CREATE POLICY "Tenants can view their assigned unit"
ON units FOR SELECT TO authenticated
USING (
  id IN (
    SELECT unit_id FROM tenants
    WHERE id = auth.uid() AND unit_id IS NOT NULL
  )
);
