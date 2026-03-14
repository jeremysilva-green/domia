-- Add proof of payment columns to rent_payments
-- Tenants upload a proof image; owners confirm with one tap.
ALTER TABLE rent_payments
  ADD COLUMN IF NOT EXISTS proof_image_url text,
  ADD COLUMN IF NOT EXISTS proof_seen_by_owner boolean NOT NULL DEFAULT false;

-- Allow authenticated tenants to update their own payment proof
CREATE POLICY "Tenants can update their own payment proof"
  ON rent_payments FOR UPDATE
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Storage bucket for payment proof images
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

CREATE POLICY "Payment proofs are publicly readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "Authenticated users can update payment proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-proofs');
