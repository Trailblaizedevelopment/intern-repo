-- ═══════════════════════════════════════════════════════════════════════════
-- Ticket System V2 Migration
-- Run against Supabase Postgres
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Projects table ───
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'paused', 'completed', 'archived')),
  start_date DATE,
  target_date DATE,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Milestones table ───
CREATE TABLE IF NOT EXISTS milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Project Documents table ───
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alter tickets table (add columns if not exists) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'due_date') THEN
    ALTER TABLE tickets ADD COLUMN due_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'labels') THEN
    ALTER TABLE tickets ADD COLUMN labels TEXT[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'story_points') THEN
    ALTER TABLE tickets ADD COLUMN story_points INT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'project_id') THEN
    ALTER TABLE tickets ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'parent_ticket_id') THEN
    ALTER TABLE tickets ADD COLUMN parent_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'milestone_id') THEN
    ALTER TABLE tickets ADD COLUMN milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'sprint') THEN
    ALTER TABLE tickets ADD COLUMN sprint TEXT;
  END IF;
END $$;

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_parent_ticket_id ON tickets(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_milestone_id ON tickets(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sprint ON tickets(sprint);
CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON tickets(due_date);

-- ─── RLS Policies ───
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Projects: open read, service_role bypass
CREATE POLICY "projects_read" ON projects FOR SELECT USING (true);
CREATE POLICY "projects_service_all" ON projects FOR ALL USING (true) WITH CHECK (true);

-- Milestones: open read, service_role bypass
CREATE POLICY "milestones_read" ON milestones FOR SELECT USING (true);
CREATE POLICY "milestones_service_all" ON milestones FOR ALL USING (true) WITH CHECK (true);

-- Project Documents: open read, service_role bypass
CREATE POLICY "project_documents_read" ON project_documents FOR SELECT USING (true);
CREATE POLICY "project_documents_service_all" ON project_documents FOR ALL USING (true) WITH CHECK (true);

-- ─── Updated_at triggers ───
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS milestones_updated_at ON milestones;
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS project_documents_updated_at ON project_documents;
CREATE TRIGGER project_documents_updated_at BEFORE UPDATE ON project_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
