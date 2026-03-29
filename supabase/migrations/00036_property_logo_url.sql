-- Add logo_url column to properties table for the round avatar shown in property list cards
ALTER TABLE properties ADD COLUMN IF NOT EXISTS logo_url TEXT;
