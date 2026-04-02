-- Chapter Matches: headhunting match log persistence
-- Run against: https://supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql

CREATE TABLE IF NOT EXISTS chapter_matches (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id    UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  active_member TEXT NOT NULL,
  alumni_name   TEXT NOT NULL,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapter_matches_chapter_id ON chapter_matches(chapter_id);

ALTER TABLE chapter_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chapter_matches_all" ON chapter_matches;
CREATE POLICY "chapter_matches_all" ON chapter_matches
  FOR ALL USING (true) WITH CHECK (true);
