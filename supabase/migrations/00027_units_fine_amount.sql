-- Add fine_amount to units
-- The owner sets a fine price; it is auto-applied after 3 days of grace
-- past the monthly rent due date derived from the tenant's contract period.
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS fine_amount numeric(10, 2);
