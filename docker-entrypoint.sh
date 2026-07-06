#!/bin/sh
set -eu
CONFIG=/app/config.env
if [ ! -f "$CONFIG" ]; then echo "Missing /app/config.env"; exit 1; fi
DB_URL=$(sed -n 's/^SUPABASE_DB_URL=//p' "$CONFIG" | tail -n 1 | tr -d '\r')
if [ -z "$DB_URL" ] || echo "$DB_URL" | grep -q 'replace_me'; then echo "Set SUPABASE_DB_URL in config.env"; exit 1; fi
echo "Checking Supabase schema..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c 'create table if not exists public.pixelship_migrations (name text primary key, applied_at timestamptz not null default now());'
for file in /app/supabase/schema.sql /app/supabase/002_private_by_default.sql /app/supabase/003_conversations.sql /app/supabase/004_content.sql /app/supabase/005_custom_aspect_ratios.sql; do
  name=$(basename "$file")
  applied=$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c "select count(*) from public.pixelship_migrations where name='$name';" | tr -d '[:space:]')
  if [ "$applied" != "1" ]; then
    echo "Applying $name"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -1 -f "$file"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "insert into public.pixelship_migrations(name) values ('$name') on conflict do nothing;"
  fi
done
echo "Supabase is ready."
exec npm start
