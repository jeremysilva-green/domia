-- Add currency column to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add check constraint to ensure valid currency values
ALTER TABLE units ADD CONSTRAINT units_currency_check CHECK (currency IN ('USD', 'PYG'));
