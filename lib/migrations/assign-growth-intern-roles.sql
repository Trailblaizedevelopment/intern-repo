-- =====================================================
-- Migration: Assign growth_intern role to Hyatt and Ally
-- ⚠️  REQUIRES OWEN APPROVAL before running
-- Run in Supabase SQL Editor (service role / postgres access)
-- =====================================================

-- STEP 1: Verify the records exist before changing anything
-- Run this SELECT first and confirm both names appear:
SELECT id, auth_user_id, name, email, role, status
FROM employees
WHERE lower(name) LIKE '%hyatt%' OR lower(name) LIKE '%ally%';

-- =====================================================
-- STEP 2: Update the employees table role column
-- =====================================================
UPDATE employees
SET
  role       = 'growth_intern',
  updated_at = NOW()
WHERE lower(name) LIKE '%hyatt%' OR lower(name) LIKE '%ally%';

-- =====================================================
-- STEP 3: Update Supabase Auth user_metadata
-- The app reads role from JWT user_metadata (not the DB),
-- so this step is REQUIRED for the role to take effect on login.
--
-- The auth.users table is in a protected schema.
-- Run this using the Supabase Dashboard → SQL Editor (as postgres/service role):
-- =====================================================

-- 3a. Merge growth_intern role into existing user_metadata
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "growth_intern"}'::jsonb
WHERE id IN (
  SELECT auth_user_id
  FROM employees
  WHERE lower(name) LIKE '%hyatt%' OR lower(name) LIKE '%ally%'
    AND auth_user_id IS NOT NULL
);

-- =====================================================
-- STEP 4: Verify the result
-- =====================================================
SELECT
  e.id,
  e.name,
  e.email,
  e.role             AS employees_role,
  e.status,
  u.raw_user_meta_data ->> 'role' AS jwt_role
FROM employees e
LEFT JOIN auth.users u ON u.id = e.auth_user_id
WHERE lower(e.name) LIKE '%hyatt%' OR lower(e.name) LIKE '%ally%';

-- Expected result:
--   employees_role = 'growth_intern'
--   jwt_role       = 'growth_intern'
--
-- NOTE: Users must log out and back in (or have their session refreshed)
-- for the new JWT role to take effect in the app.
