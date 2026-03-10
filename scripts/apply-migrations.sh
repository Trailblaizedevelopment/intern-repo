#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# apply-migrations.sh
# Applies pending Supabase SQL migrations against the internal workspace DB.
#
# Usage:
#   DB_PASSWORD=<your-supabase-db-password> bash scripts/apply-migrations.sh
#
# Or run via Supabase SQL editor (supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql):
#   Paste each migration file's content and run.
#
# Migrations to run (in order):
#   1. supabase/migrations/20260310_outreach_batches_fix.sql  — fix outreach_batches schema + status constraint
#   2. supabase/migrations/20260310_email_outreach_tables.sql — create email_campaigns, email_sends, email_unsubscribes
# ──────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_REF="uoemlefauspgmmpeoilq"
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_PORT="5432"
DB_USER="postgres"
DB_NAME="postgres"
DB_PASS="${DB_PASSWORD:-}"

if [ -z "$DB_PASS" ]; then
  echo "ERROR: DB_PASSWORD env var is required."
  echo "Usage: DB_PASSWORD=<password> bash scripts/apply-migrations.sh"
  echo ""
  echo "Find your DB password at:"
  echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
  exit 1
fi

PSQL_CMD="PGPASSWORD=${DB_PASS} psql postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

MIGRATIONS=(
  "supabase/migrations/20260310_outreach_batches_fix.sql"
  "supabase/migrations/20260310_email_outreach_tables.sql"
)

for f in "${MIGRATIONS[@]}"; do
  echo "──────────────────────────────────────────"
  echo "Applying: $f"
  eval "$PSQL_CMD" -f "$f"
  echo "Done: $f"
done

echo ""
echo "All migrations applied successfully!"
echo "Verifying tables..."
eval "$PSQL_CMD" -c "
  SELECT tablename 
  FROM pg_tables 
  WHERE schemaname='public' 
    AND tablename IN ('outreach_batches','email_campaigns','email_sends','email_unsubscribes')
  ORDER BY tablename;"
