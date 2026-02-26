-- Add RUC field to tenants table so tenant-entered RUC syncs to owner view
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ruc TEXT;
