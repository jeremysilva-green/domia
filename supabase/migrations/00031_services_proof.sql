-- Add services proof of payment column to rent_payments
ALTER TABLE rent_payments
  ADD COLUMN IF NOT EXISTS services_proof_image_url text,
  ADD COLUMN IF NOT EXISTS services_proof_seen_by_owner boolean NOT NULL DEFAULT false;
