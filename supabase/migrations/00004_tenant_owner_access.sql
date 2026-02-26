-- Allow any authenticated user (including tenants) to view owner profiles
-- This is needed for the tenant app to show the list of owners

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Owners can view own profile" ON owners;

-- Create a new policy that allows all authenticated users to view owner profiles
CREATE POLICY "Authenticated users can view owner profiles"
  ON owners FOR SELECT
  TO authenticated
  USING (true);

-- Keep the existing update policy for owners only
-- (already exists: "Owners can update own profile")

-- Allow tenants to insert their own record into tenants table when approved
CREATE POLICY "Tenants can insert own record"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Allow tenants to view their own record
CREATE POLICY "Tenants can view own record"
  ON tenants FOR SELECT
  TO authenticated
  USING (id = auth.uid());
