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

## [2026-06-01] Deals — assigned_to Column

Adds `assigned_to` (employee FK) to the `deals` table so the My Deals tab can filter by rep.

```sql
ALTER TABLE deals ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);

-- ── FORD (3853cd9d-0773-4d04-b23f-20eb51717e0f) ──────────────────────────────
-- Baylor block (all sourced/worked by Ford aka "Greg") + explicit Ford-handled deals
UPDATE deals SET assigned_to = '3853cd9d-0773-4d04-b23f-20eb51717e0f'
WHERE id IN (
  -- Baylor
  'e17c6ba1-2143-42ab-9aee-412f7f391ea7', -- KA Baylor
  'b43a27d7-9fd8-4c84-af72-3f1fe50e4459', -- Kappa Omega Tau Baylor
  '7248bb6a-8863-4f96-8409-57311f7a1336', -- Pi Beta Phi Baylor
  'eb66733d-ab70-4b7e-9f31-d2fc9ef6d516', -- Delta Tau Delta Baylor
  'bed227a0-f8f4-40c3-bbb1-d8fb33e85475', -- Delta Sigma Pi Baylor
  '8e86e3e1-7b06-400d-b38b-bc895292eed0', -- Men''s Lacrosse Baylor
  '03164e55-0180-4ee3-85e5-a04a6725482e', -- Alpha Chi Omega Baylor
  '25e9f859-257b-4572-87ad-a9c521c0524d', -- Kappa Alpha Theta Baylor
  'f62d5732-d73f-4af4-812f-6c02194731c1', -- Kappa Chi Alpha Baylor
  'ddff450a-a615-4b1f-b49b-fca93e1012b1', -- Men''s Rugby Baylor
  '0fc213ad-4ff8-450c-8278-914f24c65e9e', -- Women''s Club Volleyball Baylor
  'a082d7e0-31cc-4266-bab8-f86eba4a38c9', -- Women''s Club Soccer Baylor
  'b01c2db6-66d2-4d16-ab6b-df20adc7a53a', -- Sigma Chi Baylor
  '75824f9b-7e40-4ae1-a03a-ab05b11a8084', -- Pre-Law Society Baylor
  '17a56698-fc17-408d-af44-59ecdb5dcf95', -- Finance Society Baylor
  '3358dcb1-89ba-4382-ba38-7863def69ec5', -- Beta Theta Pi Baylor
  'a6c0b374-1575-424f-b71a-4be76aaec5e2', -- Delta Delta Delta Baylor
  'a54384eb-139a-476d-bc46-a36131578bd8', -- Kappa Kappa Gamma Baylor
  'f722e00a-336a-4198-be12-7effa1968115', -- Crew/Rowing Baylor
  '1cd8355b-b3a5-4fb0-bf7b-47425c1f5bae', -- Chi Omega Baylor
  'fe77002e-5b0c-405a-8c91-f2108123f4dc', -- Kappa Sigma Baylor
  '59964e49-ec11-4d86-b21a-fdd1c43c3832', -- Kappa Alpha Psi Baylor
  'e9430d3a-4791-4e8a-87d0-381ddf612858', -- Beta Upsilon Chi Baylor
  '6c9f21b8-e708-4425-bad4-7f4c4dd77a7e', -- Baylor Entrepreneurship
  'f44da723-daec-414f-b736-cda2bbcf523a', -- Alpha Kappa Psi Baylor
  'fb237e7f-1e01-4d0e-966b-6c1caf92831a', -- Pi Kappa Phi Baylor
  'c209f46e-888c-4b72-b3a0-e16828e821a9', -- Alpha Delta Pi Baylor
  -- Explicit Ford
  '03e1aecb-5a3b-4359-8ac9-123d46ef5d19', -- LSU KA (Ford handling)
  '204bc8f0-9f6f-47c8-b824-3c4e5fc8c22a', -- Chapman DTD Griffin (Ford re-engaged)
  '8a138140-1289-46d3-a30b-b29bee1773f9'  -- Pi Kapp @ Mizzou (Ford call)
);

-- ── ADAM (66952c26-316d-4e9c-8fe1-4dd5743926ef) ───────────────────────────────
UPDATE deals SET assigned_to = '66952c26-316d-4e9c-8fe1-4dd5743926ef'
WHERE id IN (
  '097990c1-8031-4394-91b4-1e905033234f', -- Clemson Delta Chi (Adam''s lead)
  '44c1aac5-24e0-4cac-9f09-df439c923675', -- OSU AEPi (Adam''s call)
  '938801bc-8001-4738-ba93-ebe5c1f642b3'  -- Chapman Pike / Ethan Roche (Adam''s connection)
);

-- ── OWEN (33ab5810-4d9f-485e-babb-a99b650a09e1) ──────────────────────────────
-- Default: everything not yet assigned goes to Owen
UPDATE deals SET assigned_to = '33ab5810-4d9f-485e-babb-a99b650a09e1'
WHERE assigned_to IS NULL;
```

**Why:** `pipeline/page.tsx` My Deals tab filters `d.assigned_to === currentUser.id`. Without this column, no deals show up under My Deals for any rep. Assignment logic: Ford owns the Baylor block (he sourced them as "Greg") + explicit Ford-handled deals; Adam owns his 3 explicitly noted deals; Owen gets everything else as the default sales owner.

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
