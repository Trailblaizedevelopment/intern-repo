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
