alter table chapters add column if not exists contract_sent_at timestamptz;
alter table chapters add column if not exists contract_signed_at timestamptz;
alter table chapters add column if not exists contract_status text default 'not_sent' check (contract_status in ('not_sent','sent','signed','declined','voided'));
alter table chapters add column if not exists docusign_envelope_id text;
alter table chapters add column if not exists invoice_sent_at timestamptz;
alter table chapters add column if not exists invoice_paid_at timestamptz;
alter table chapters add column if not exists invoice_status text default 'not_sent' check (invoice_status in ('not_sent','sent','paid'));
alter table chapters add column if not exists submission_sent_at timestamptz;
alter table chapters add column if not exists wizard_step int default 1;
alter table chapters add column if not exists wizard_completed_at timestamptz;

create table if not exists docusign_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
