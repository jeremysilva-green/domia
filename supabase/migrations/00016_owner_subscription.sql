-- Add onboarding and subscription fields to owners table
ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS onboarding_completed    boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_name            text,
  ADD COLUMN IF NOT EXISTS plan_type               text,
  ADD COLUMN IF NOT EXISTS subscription_status     text         DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_product_id text;

-- plan_type values:   '1-10' | '10-30' | '30-50'
-- subscription_status: 'none' | 'trial' | 'active' | 'cancelled'
