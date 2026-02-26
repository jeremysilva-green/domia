-- Add bank information fields to owners table
ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_full_name TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_ruc TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_alias TEXT;
