-- Email Outreach System
-- Run against: INTERNAL workspace DB (uoemlefauspgmmpeoilq)

-- ── Campaigns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id          uuid REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  chapter_name        text NOT NULL,
  touch_number        int  NOT NULL CHECK (touch_number IN (1, 2, 3)),
  subject_line        text NOT NULL,
  template_html       text NOT NULL,   -- rendered HTML at time of send
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  -- Aggregate stats (updated by webhook handler)
  total_contacts      int  DEFAULT 0,
  sent_count          int  DEFAULT 0,
  delivered_count     int  DEFAULT 0,
  opened_count        int  DEFAULT 0,
  clicked_count       int  DEFAULT 0,
  bounced_count       int  DEFAULT 0,
  unsubscribed_count  int  DEFAULT 0,
  failed_count        int  DEFAULT 0,
  -- Scheduling helpers
  next_touch_eligible_at timestamptz, -- when T2/T3 becomes eligible
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ec_chapter_id    ON email_campaigns(chapter_id);
CREATE INDEX IF NOT EXISTS idx_ec_status        ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ec_touch         ON email_campaigns(chapter_id, touch_number);

-- ── Per-contact sends ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid REFERENCES email_campaigns(id) ON DELETE CASCADE NOT NULL,
  -- Contact info (denormalized from alumni_contacts at send time)
  contact_id          uuid,           -- alumni_contacts.id on external platform
  email               text NOT NULL,
  first_name          text,
  last_name           text,
  grad_year           int,
  -- SendGrid tracking
  sendgrid_message_id text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sent','delivered','opened','clicked','bounced','unsubscribed','failed')),
  -- Timestamps from SendGrid webhooks
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  first_clicked_at    timestamptz,
  bounced_at          timestamptz,
  bounce_type         text CHECK (bounce_type IN ('hard','soft')),
  unsubscribed_at     timestamptz,
  -- Error info
  error_message       text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_es_campaign_id   ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_es_email         ON email_sends(email);
CREATE INDEX IF NOT EXISTS idx_es_sendgrid_id   ON email_sends(sendgrid_message_id)
  WHERE sendgrid_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_es_status        ON email_sends(campaign_id, status);

-- ── Unsubscribes (global suppression list) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  chapter_id  uuid REFERENCES chapters(id) ON DELETE SET NULL,
  reason      text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eu_email ON email_unsubscribes(email);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE email_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "ec_all"  ON email_campaigns    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "es_all"  ON email_sends        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "eu_all"  ON email_unsubscribes FOR ALL USING (true) WITH CHECK (true);

-- ── Stat increment helper (called by webhook handler) ────────────────────────
CREATE OR REPLACE FUNCTION increment_campaign_stat(campaign_id uuid, stat text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'UPDATE email_campaigns SET %I = %I + 1, updated_at = now() WHERE id = $1',
    stat, stat
  ) USING campaign_id;
END;
$$;
