
## 🧪 Needs Testing

- **Creative Studio** — log post, day counter, 28-day grid (`/nucleus/creative-studio`)

---

## 🎫 Devin Tickets — Due Friday 5/9 (iOS Onboarding Data Layer)

### [1] Add org_type to chapters table
Chapters need to know what kind of org they are. Add enum field:
```sql
alter table chapters add column org_type text check (org_type in ('fraternity','sorority','ifc_council','panhellenic_council','national_hq','corps','athletic_team','school_org')) default 'fraternity';
```

### [2] Add national_org_id FK to chapters
Chapters need to link to their national org for alumni mapping and Space targeting.
```sql
alter table chapters add column national_org_id uuid references national_orgs(id);
```

### [3] Add referral_source to chapters
How did they hear about us? Critical for attribution.
```sql
alter table chapters add column referral_source text; -- 'friend','instagram','fratwrap','demo','cold_outreach','other'
```

### [4] Add primary_goal to chapters
What does the chapter want most from Trailblaize?
```sql
alter table chapters add column primary_goal text check (primary_goal in ('alumni_outreach','job_board','social_network','fundraising','all'));
```

### [5] Add alumni_chair + treasurer contact fields
We only store one contact (president). Need treasurer for billing and alumni chair for outreach.
```sql
alter table chapters
  add column alumni_chair_name text,
  add column alumni_chair_email text,
  add column alumni_chair_phone text,
  add column treasurer_name text,
  add column treasurer_email text,
  add column treasurer_phone text;
```

### [6] Add push_notification_tokens table (iOS)
```sql
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id),
  user_id text,
  token text not null,
  platform text default 'ios',
  created_at timestamptz default now()
);
```

### [7] Add onboarding_source to chapters
Track whether they came through web or iOS.
```sql
alter table chapters add column onboarding_source text default 'web' check (onboarding_source in ('web','ios'));
```
