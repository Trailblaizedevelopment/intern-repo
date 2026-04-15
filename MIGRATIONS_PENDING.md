# MIGRATIONS_PENDING.md

Pending SQL migrations to be run manually by Owen against the internal workspace DB (`uoemlefauspgmmpeoilq`).

---

## [2026-04-10] Headhunting → Platform Profile Linking

Links `chapter_members` (headhunting) rows to their corresponding platform profile on trailblaize.net.

```sql
ALTER TABLE chapter_members ADD COLUMN IF NOT EXISTS platform_member_id TEXT;
ALTER TABLE chapter_members ADD COLUMN IF NOT EXISTS platform_joined_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_chapter_members_platform_member_id ON chapter_members(platform_member_id);
```

**Why:** When an alumni signs up on trailblaize.net, the alumni-signup webhook now matches them against `chapter_members` by name + chapter and stores the link. The Headhunting tab UI uses this to show a "✓ On Platform" badge.

---

## [2026-04-10] Deal Last-Activity Tracking

Adds `last_activity_at` to `pipeline_deals` for tracking when a deal was last touched (call logged, stage changed, fields edited). Used by the pipeline page to show "X days since last contact" and color-code going-cold deals.

```sql
ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill from last_touched where available
UPDATE pipeline_deals
  SET last_activity_at = last_touched
  WHERE last_activity_at IS NULL AND last_touched IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_deals_last_activity_at ON pipeline_deals(last_activity_at);
```

**Why:** `pipeline/page.tsx` and `DealEditPanel.tsx` write `last_activity_at` on every deal touch (logCall, advanceStage, save). Without this column the updates fail silently with a Supabase error. The "Going Cold" badge and "X days since last contact" subtitle on deal cards require this field.
