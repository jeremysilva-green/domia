-- Track when a tenant has submitted a disconnection request but owner hasn't approved yet
ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS disconnection_pending boolean NOT NULL DEFAULT false;
