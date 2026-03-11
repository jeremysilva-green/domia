-- Track unseen items for owner notification badges
ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS seen_by_owner boolean DEFAULT false;

-- Mark existing records as seen so owners aren't spammed with old notifications
UPDATE connection_requests SET seen_by_owner = true;

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS seen_by_owner boolean DEFAULT false;

-- Mark existing records as seen so owners aren't spammed with old notifications
UPDATE maintenance_requests SET seen_by_owner = true;
