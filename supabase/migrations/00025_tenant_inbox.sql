-- Track whether the tenant has seen connection request status changes
-- (approved / rejected notifications in the tenant inbox)
ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS seen_by_tenant boolean DEFAULT true;

-- Future approvals/rejections will set this to false in code.
-- Existing records stay true so old items don't spam the inbox.
