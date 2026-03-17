CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES pipeline_deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'text', 'email', 'meeting', 'note')),
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_deal_activities_deal_id ON deal_activities(deal_id);
