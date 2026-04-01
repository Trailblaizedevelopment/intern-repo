-- Add 'executing' status to outreach_batches CHECK constraint
-- This status is used for chunked cron execution (large batches dripped 25 at a time)

ALTER TABLE outreach_batches
  DROP CONSTRAINT IF EXISTS outreach_batches_status_check;

ALTER TABLE outreach_batches
  ADD CONSTRAINT outreach_batches_status_check
  CHECK (status IN ('pending_approval', 'approved', 'executing', 'sending', 'rejected', 'completed', 'cancelled'));
