-- Add advisor contact fields to pipeline_deals
-- Tracks the chapter advisor for each deal + whether we've met with them

ALTER TABLE pipeline_deals
  ADD COLUMN IF NOT EXISTS advisor_name  text,
  ADD COLUMN IF NOT EXISTS advisor_email text,
  ADD COLUMN IF NOT EXISTS advisor_phone text,
  ADD COLUMN IF NOT EXISTS advisor_met   boolean NOT NULL DEFAULT false;
