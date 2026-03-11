-- Separate subscriptions table for verified Google Play purchase records
-- The quick-access columns (plan_type, subscription_status, etc.) remain on owners
-- This table holds the full purchase token history for backend verification

CREATE TABLE IF NOT EXISTS subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      text        NOT NULL,
  purchase_token  text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'active',  -- active | cancelled | expired | grace_period | on_hold
  expiry_date     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_own_subscriptions" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();
