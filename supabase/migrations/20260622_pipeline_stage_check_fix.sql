-- Fix pipeline_deals_stage_check constraint to include all current stages:
-- second_call, timing, and hold_off were added to the frontend but never
-- added to the DB constraint, causing "violates check constraint" errors.

ALTER TABLE pipeline_deals DROP CONSTRAINT IF EXISTS pipeline_deals_stage_check;

ALTER TABLE pipeline_deals ADD CONSTRAINT pipeline_deals_stage_check
  CHECK (stage IN (
    'lead',
    'demo_booked',
    'first_demo',
    'second_call',
    'timing',
    'contract_sent',
    'closed_won',
    'closed_lost',
    'hold_off'
  ));
