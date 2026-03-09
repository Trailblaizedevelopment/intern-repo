-- Linq line configuration: tracks pause state for each sending line
CREATE TABLE IF NOT EXISTS linq_line_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_phone     text UNIQUE NOT NULL,
  line_number    int  NOT NULL,
  label          text NOT NULL,
  daily_limit    int  NOT NULL DEFAULT 45,
  is_paused      boolean NOT NULL DEFAULT false,
  pause_reason   text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO linq_line_config (line_phone, line_number, label, daily_limit, is_paused)
VALUES
  ('+16462408056', 1, 'Owen', 45, false),
  ('+16462668785', 2, 'Adam', 45, false),
  ('+16462442696', 3, 'Ford', 45, false)
ON CONFLICT (line_phone) DO NOTHING;
