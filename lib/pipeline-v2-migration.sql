-- Pipeline V2 Migration
-- Run against Supabase Postgres

-- 1. Schools
CREATE TABLE IF NOT EXISTS schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  conference TEXT,
  enrollment INT,
  total_greek_orgs INT,
  chapters_sold INT DEFAULT 0,
  alumni_estimated INT,
  alumni_onboarded INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. National Orgs
CREATE TABLE IF NOT EXISTS national_orgs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  type TEXT NOT NULL CHECK (type IN ('fraternity', 'sorority')),
  nic_npc BOOLEAN DEFAULT true,
  chapter_count INT,
  stage TEXT DEFAULT 'prospect' CHECK (stage IN ('prospect', 'outreach', 'demo', 'negotiation', 'contract_sent', 'signed', 'lost')),
  value INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Organizations (chapters/councils at a school)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  national_org_id UUID REFERENCES national_orgs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('chapter', 'ifc', 'phc', 'club', 'athletic')),
  status TEXT DEFAULT 'prospect' CHECK (status IN ('prospect', 'active_customer', 'churned', 'hold')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  national_org_id UUID REFERENCES national_orgs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT CHECK (role IN ('president', 'advisor', 'fsl_director', 'nationals_rep', 'alumni_chair', 'board_member', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Pipeline Deals
CREATE TABLE IF NOT EXISTS pipeline_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  deal_type TEXT NOT NULL CHECK (deal_type IN ('local', 'council', 'national')),
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won', 'closed_lost', 'hold_off')),
  value INT DEFAULT 0,
  temperature TEXT DEFAULT 'cold' CHECK (temperature IN ('hot', 'warm', 'cold')),
  next_followup DATE,
  last_touched TIMESTAMPTZ,
  followup_count INT DEFAULT 0,
  notes TEXT,
  conference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_school ON organizations(school_id);
CREATE INDEX IF NOT EXISTS idx_organizations_national ON organizations(national_org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_national ON contacts(national_org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_org ON pipeline_deals(org_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_contact ON pipeline_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_assigned ON pipeline_deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_stage ON pipeline_deals(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_followup ON pipeline_deals(next_followup);
CREATE INDEX IF NOT EXISTS idx_schools_conference ON schools(conference);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_national_orgs_updated_at BEFORE UPDATE ON national_orgs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_pipeline_deals_updated_at BEFORE UPDATE ON pipeline_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_deals ENABLE ROW LEVEL SECURITY;

-- Open read for all authenticated + service role bypass
DO $$ BEGIN
  CREATE POLICY "Allow read access" ON schools FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow read access" ON national_orgs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow read access" ON organizations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow read access" ON contacts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow read access" ON pipeline_deals FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role full access
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON schools FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON national_orgs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON organizations FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON contacts FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON pipeline_deals FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
