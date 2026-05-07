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

---

## [2026-05-07] Creative Studio — Post Tracking Table

New table for the 28-day content experiment (May 9 – June 5, 2026). Tracks posts across 3 content types at 5/day each = 15/day target.

```sql
create table creative_posts (
  id uuid primary key default gen_random_uuid(),
  post_date date not null,
  content_type text not null check (content_type in ('real_person','ai_influencer','ai_pictures')),
  caption text,
  link text,
  notes text,
  created_at timestamptz default now()
);

create index idx_creative_posts_date on creative_posts(post_date);
create index idx_creative_posts_type on creative_posts(content_type);
```

**Why:** Powers `/nucleus/creative-studio` — the 28-day content dashboard. API at `/api/creative-posts` reads/writes this table. Run against internal workspace DB (`uoemlefauspgmmpeoilq`).
