-- Migration: Create meetings table for Granola/Calendar data
-- Date: 2026-06-23
-- Purpose: Separate meeting records from pipeline deals

CREATE TABLE IF NOT EXISTS meetings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  source text DEFAULT 'calendar' CHECK (source IN ('calendar', 'granola', 'manual')),
  meeting_date timestamptz,
  granola_note_id text,
  summary text,
  attendees jsonb DEFAULT '[]',
  pipeline_deal_id uuid REFERENCES pipeline_deals(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for quick lookups by org and date
CREATE INDEX IF NOT EXISTS idx_meetings_org_id ON meetings(org_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_employee ON meetings(employee_id);
CREATE INDEX IF NOT EXISTS idx_meetings_source ON meetings(source);

-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all meetings
CREATE POLICY "Authenticated users can read meetings" ON meetings
  FOR SELECT TO authenticated USING (true);

-- Policy: authenticated users can insert meetings  
CREATE POLICY "Authenticated users can insert meetings" ON meetings
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policy: authenticated users can update meetings
CREATE POLICY "Authenticated users can update meetings" ON meetings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Comment
COMMENT ON TABLE meetings IS 'Meeting records from Granola notes and Google Calendar. Separated from pipeline_deals to keep deal data clean.';
