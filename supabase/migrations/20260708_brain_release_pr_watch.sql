-- Release PR watch: auto-compose develop → main PR descriptions.
INSERT INTO brain_automations (name, kind, schedule, config)
VALUES (
  'release_pr_watch',
  'cron',
  '*/5 * * * *',
  '{"description":"Every 5 min: detect develop→main PR, write release description, notify Slack"}'
)
ON CONFLICT (name) DO NOTHING;
