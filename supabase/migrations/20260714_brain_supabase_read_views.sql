-- Brain read-only CRM views + catalog RPC
-- Agent may only query public views named brain_v_*.
-- Add a new view with that prefix to grant access — no app redeploy required for discovery.

-- ─── Views ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW brain_v_employees
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  email,
  role,
  department,
  status,
  start_date,
  created_at
FROM employees;

COMMENT ON VIEW brain_v_employees IS
  'Internal team members (interns, engineers, founders, ops). Excludes auth_user_id.';

CREATE OR REPLACE VIEW brain_v_contacts
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  email,
  phone,
  role,
  org_id,
  national_org_id,
  notes,
  created_at,
  updated_at
FROM contacts;

COMMENT ON VIEW brain_v_contacts IS
  'External pipeline contacts (presidents, advisors, FSL directors, etc.).';

CREATE OR REPLACE VIEW brain_v_chapters
WITH (security_invoker = true)
AS
SELECT
  id,
  chapter_name,
  school,
  fraternity,
  contact_name,
  contact_email,
  status,
  health,
  mrr,
  onboarding_started,
  onboarding_completed,
  last_activity,
  next_action,
  created_at,
  updated_at
FROM chapters;

COMMENT ON VIEW brain_v_chapters IS
  'Customer Success chapters — status/health/MRR summary (no personal alumni lists).';

-- ─── Catalog RPC (discovers all brain_v_* views + columns) ───────────────────

CREATE OR REPLACE FUNCTION brain_list_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', v.table_name,
        'description', coalesce(
          obj_description((quote_ident(v.table_schema) || '.' || quote_ident(v.table_name))::regclass, 'pg_class'),
          ''
        ),
        'columns', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', c.column_name,
                'data_type', c.data_type,
                'udt_name', c.udt_name
              )
              ORDER BY c.ordinal_position
            ),
            '[]'::jsonb
          )
          FROM information_schema.columns c
          WHERE c.table_schema = v.table_schema
            AND c.table_name = v.table_name
        )
      )
      ORDER BY v.table_name
    ),
    '[]'::jsonb
  )
  FROM information_schema.views v
  WHERE v.table_schema = 'public'
    AND v.table_name LIKE 'brain\_v\_%' ESCAPE '\';
$$;

COMMENT ON FUNCTION brain_list_catalog() IS
  'Returns Brain-readable view catalog (brain_v_* only) for the Supabase connector.';

REVOKE ALL ON FUNCTION brain_list_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brain_list_catalog() TO service_role;
GRANT EXECUTE ON FUNCTION brain_list_catalog() TO authenticated;

-- PostgREST needs views exposable; grant SELECT to roles Brain may use
GRANT SELECT ON brain_v_employees TO service_role, authenticated;
GRANT SELECT ON brain_v_contacts TO service_role, authenticated;
GRANT SELECT ON brain_v_chapters TO service_role, authenticated;
