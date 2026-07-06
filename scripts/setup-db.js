const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config.env');
const migrations = [
  'schema.sql',
  '002_private_by_default.sql',
  '003_conversations.sql',
  '004_content.sql',
  '005_custom_aspect_ratios.sql',
];

function loadConfig() {
  const env = {};
  if (!fs.existsSync(configPath)) {
    throw new Error('Missing config.env');
  }
  for (const line of fs.readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^[ '\"]|[ '\"]$/g, '').trim();
  }
  return env;
}

async function main() {
  const env = loadConfig();
  const connectionString = env.SUPABASE_DB_URL;
  if (!connectionString || connectionString.includes('replace_me')) {
    throw new Error('Set SUPABASE_DB_URL in config.env');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Checking Supabase schema...');
  await client.connect();
  try {
    await client.query(
      'create table if not exists public.pixelship_migrations (name text primary key, applied_at timestamptz not null default now())'
    );

    for (const name of migrations) {
      const file = path.join(root, 'supabase', name);
      if (!fs.existsSync(file)) continue;

      const applied = await client.query(
        'select 1 from public.pixelship_migrations where name = $1 limit 1',
        [name]
      );
      if (applied.rowCount) continue;

      console.log(`Applying ${name}`);
      await client.query('begin');
      try {
        await client.query(fs.readFileSync(file, 'utf8'));
        await client.query(
          'insert into public.pixelship_migrations(name) values ($1) on conflict do nothing',
          [name]
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  console.log('Supabase is ready.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
