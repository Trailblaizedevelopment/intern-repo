-- setup_leads: captures everyone who initiates checkout on the set-up form
-- status: 'checkout_started' → 'converted'
-- upsert key: leader_email (one row per email, updated on retry)

CREATE TABLE IF NOT EXISTS public.setup_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name          text NOT NULL,
  school            text,
  org_type          text,
  member_count      integer,
  designation       text,
  leader_name       text,
  leader_email      text NOT NULL,
  leader_phone      text,
  instagram_handle  text,
  price_per_month   integer,
  stripe_session_id text,
  status            text NOT NULL DEFAULT 'checkout_started',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- unique on email so upsert works cleanly
CREATE UNIQUE INDEX IF NOT EXISTS setup_leads_leader_email_idx ON public.setup_leads (leader_email);

-- RLS: service role only (no public access)
ALTER TABLE public.setup_leads ENABLE ROW LEVEL SECURITY;
