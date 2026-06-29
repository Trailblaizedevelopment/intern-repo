-- Multi-contact support for pipeline deals
CREATE TABLE deal_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES pipeline_deals(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, contact_id)
);
CREATE INDEX idx_deal_contacts_deal_id ON deal_contacts(deal_id);
INSERT INTO deal_contacts (deal_id, contact_id, is_primary)
SELECT id, contact_id, true FROM pipeline_deals WHERE contact_id IS NOT NULL;
