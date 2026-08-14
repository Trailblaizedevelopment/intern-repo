# MIGRATIONS_PENDING.md

Pending SQL migrations to be run manually by Owen against the internal workspace DB (`uoemlefauspgmmpeoilq`).

---

- `supabase/migrations/20260814_scout_profile_repair.sql` — null `university` where it equals `chapter`; clear search-geo `location`/`goals`; rescore `profile_complete`.
