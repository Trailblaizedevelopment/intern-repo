-- Instagram flyer tracker fields on chapters table
-- Added: 2026-03-31 by Forge
-- Purpose: Track whether chapters have posted Trailblaize flyers to their Instagram story.
--          This is a key activation milestone used for health score and onboarding checklist.

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS instagram_flyer_posted    boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_flyer_post_date date,
  ADD COLUMN IF NOT EXISTS instagram_flyer_post_url  text,
  ADD COLUMN IF NOT EXISTS instagram_flyer_notes     text;
