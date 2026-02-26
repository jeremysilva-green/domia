-- Allow all authenticated users (including tenants) to view all properties
-- so tenants can search and find properties to connect with
CREATE POLICY "Authenticated users can view all properties"
ON properties FOR SELECT TO authenticated
USING (true);
