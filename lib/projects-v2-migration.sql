-- Projects V2 — Screenshots + Comments tables

CREATE TABLE IF NOT EXISTS project_screenshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_screenshots_project_id ON project_screenshots(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_created_at ON project_comments(created_at);

ALTER TABLE project_screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_screenshots_read" ON project_screenshots FOR SELECT USING (true);
CREATE POLICY "project_screenshots_all" ON project_screenshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "project_comments_read" ON project_comments FOR SELECT USING (true);
CREATE POLICY "project_comments_all" ON project_comments FOR ALL USING (true) WITH CHECK (true);
