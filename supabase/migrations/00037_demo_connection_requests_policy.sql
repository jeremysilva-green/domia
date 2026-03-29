-- Allow demo (anonymous) tenants to send connection requests to demo owners only.
-- Regular (non-anonymous) tenants are unaffected.

DROP POLICY IF EXISTS "Tenants can create connection requests" ON connection_requests;

CREATE POLICY "Tenants can create connection requests"
ON connection_requests FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = auth.uid()
  AND (
    -- Regular users can connect to any property (existing behaviour)
    (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
    OR
    -- Demo (anonymous) users can only connect to demo owners' properties
    owner_id IN (SELECT id FROM owners WHERE plan_type = 'demo')
  )
);
