-- Store canonical Linear issue URL on CRM tickets (from API or sync)

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS linear_url TEXT;

COMMENT ON COLUMN tickets.linear_url IS 'Canonical Linear issue URL e.g. https://linear.app/trailblaize/issue/TRA-123';

-- Backfill from synced Linear cache where available
UPDATE tickets t
SET linear_url = li.url
FROM linear_issues li
WHERE t.external_id = li.id
  AND li.url IS NOT NULL
  AND (t.linear_url IS NULL OR t.linear_url = '');
