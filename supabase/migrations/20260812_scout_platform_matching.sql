-- Scout platform matching: chapter-scoped candidates from consumer profiles
-- Date: 2026-08-12

-- ─── scout_profiles: stable platform space key ───────────────────────────────

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS platform_chapter_id UUID;

CREATE INDEX IF NOT EXISTS idx_scout_profiles_platform_chapter
  ON scout_profiles(platform_chapter_id)
  WHERE platform_chapter_id IS NOT NULL;

-- ─── scout_introductions: platform targets (not required in scout_profiles) ─

ALTER TABLE scout_introductions
  ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS platform_target_id UUID,
  ADD COLUMN IF NOT EXISTS platform_target_snapshot JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_intros_requester_platform_target
  ON scout_introductions(requester_id, platform_target_id)
  WHERE platform_target_id IS NOT NULL;

COMMENT ON COLUMN scout_profiles.platform_chapter_id IS 'Platform spaces.id (profiles.chapter_id) for chapter-scoped matching';
COMMENT ON COLUMN scout_introductions.platform_target_id IS 'Platform profiles.id when target is not a scout_profiles row';
COMMENT ON COLUMN scout_introductions.platform_target_snapshot IS 'Denormalized platform profile fields for Nucleus display';
