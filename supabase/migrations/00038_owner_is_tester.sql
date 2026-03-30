-- Add is_tester flag to owners table.
-- When true, the owner bypasses IAP at the paywall and gets free access
-- to any selected plan. Use this for Google Play closed testers.

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;

-- To grant tester access, run:
-- UPDATE owners SET is_tester = true WHERE email IN ('tester@example.com', ...);
