-- Allow tenants to insert their own payment records (needed for proof upload auto-create)
CREATE POLICY "Tenants can insert their own payment records"
  ON rent_payments FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = auth.uid());
