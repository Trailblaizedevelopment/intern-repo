-- Repair identity vs search-intent pollution on scout_profiles.
-- Additive data fix only — does not drop conversation_stage / agent_state / offered_ids.

-- Chapter name was copied into university on create. Leave university null unless it
-- already differs from chapter (a real campus name).
UPDATE scout_profiles
SET university = NULL, updated_at = NOW()
WHERE university IS NOT NULL
  AND chapter IS NOT NULL
  AND university = chapter;

-- Search geo (e.g. Texas) was written into identity location. Only clear a bare
-- state when hometown already holds identity geo, so a real Texas home is kept.
UPDATE scout_profiles
SET location = NULL, updated_at = NOW()
WHERE lower(trim(location)) = 'texas'
  AND hometown IS NOT NULL
  AND btrim(hometown) <> '';

-- Drop stale Texas goal entries after an Atlanta-only pivot. Keep other goals
-- and skip people whose looking_for still mentions Texas (multi-region intent).
UPDATE scout_profiles
SET goals = COALESCE((
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(goals) AS elem
      WHERE lower(elem::text) NOT LIKE '%texas%'
    ), '[]'::jsonb),
    updated_at = NOW()
WHERE looking_for ILIKE '%atlanta%'
  AND looking_for NOT ILIKE '%texas%'
  AND looking_for !~* '\mtx\m'
  AND jsonb_typeof(goals) = 'array'
  AND goals <> '[]'::jsonb
  AND goals::text ILIKE '%texas%';

-- Rescore completeness on match-driving fields (mirrors lib/scout/discovery.ts).
UPDATE scout_profiles SET profile_complete = LEAST(100,
  (CASE WHEN platform_chapter_id IS NOT NULL OR (chapter IS NOT NULL AND btrim(chapter) <> '') THEN 15 ELSE 0 END) +
  (CASE WHEN graduation_year IS NOT NULL THEN 10 ELSE 0 END) +
  (CASE WHEN member_status IS NOT NULL AND btrim(member_status) <> '' THEN 10 ELSE 0 END) +
  (CASE WHEN (hometown IS NOT NULL AND btrim(hometown) <> '')
          OR (location IS NOT NULL AND btrim(location) <> '') THEN 15 ELSE 0 END) +
  (CASE WHEN looking_for IS NOT NULL AND length(btrim(looking_for)) >= 8 THEN 20 ELSE 0 END) +
  (CASE
     WHEN industry IS NOT NULL AND btrim(industry) <> '' THEN 20
     WHEN company IS NOT NULL AND btrim(company) <> '' THEN 20
     WHEN job_title IS NOT NULL AND btrim(job_title) <> ''
       AND lower(replace(btrim(job_title), ' ', '_')) NOT IN (
         'alumni', 'alum', 'active', 'active_member', 'graduated', 'member', 'pledge', 'new_member'
       ) THEN 20
     ELSE 0
   END) +
  (CASE
     WHEN linkedin_url IS NOT NULL AND btrim(linkedin_url) <> '' THEN 10
     WHEN bio IS NOT NULL AND length(btrim(bio)) >= 20 THEN 10
     ELSE 0
   END)
);
