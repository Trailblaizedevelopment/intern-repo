ALTER TABLE chapter_members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS job_role TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS is_hiring BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chapter_members_type ON chapter_members(member_type);
CREATE INDEX IF NOT EXISTS idx_chapter_members_hiring ON chapter_members(is_hiring) WHERE is_hiring = true;
