-- CS Module: signup links + headhunting table
-- Run against your Supabase project

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS alumni_join_link TEXT,
  ADD COLUMN IF NOT EXISTS actives_join_link TEXT;

CREATE TABLE IF NOT EXISTS chapter_members (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id    UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  grad_year     INTEGER,
  major         TEXT,
  career_interest TEXT,
  status        TEXT DEFAULT 'looking'
                CHECK (status IN ('looking','in_progress','placed','not_tracking')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapter_members_chapter_id ON chapter_members(chapter_id);

-- RLS: allow authenticated read/write (adjust to your policy)
ALTER TABLE chapter_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "chapter_members_all" ON chapter_members
  FOR ALL USING (true) WITH CHECK (true);
