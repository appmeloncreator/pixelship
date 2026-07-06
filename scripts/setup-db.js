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

const requiredTables = [
  'profiles',
  'posts',
  'likes',
  'comments',
  'follows',
  'generations',
  'conversations',
  'messages',
  'blog_posts',
  'notifications',
];

function loadConfig() {
  const env = {};
  if (!fs.existsSync(configPath)) {
    throw new Error('Missing config.env');
  }
  for (const line of fs.readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function missingSetup(client) {
  const missing = [];
  for (const table of requiredTables) {
    const result = await client.query('select to_regclass($1) as name', [`public.${table}`]);
    if (!result.rows[0]?.name) missing.push(`table public.${table}`);
  }

  const columns = await client.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'posts'"
  );
  const postColumns = new Set(columns.rows.map((row) => row.column_name));
  for (const column of ['aspect_ratio', 'generation_mode', 'is_public']) {
    if (!postColumns.has(column)) missing.push(`column public.posts.${column}`);
  }

  const bucket = await client.query("select 1 from storage.buckets where id = 'creations' limit 1");
  if (!bucket.rowCount) missing.push('storage bucket creations');

  const trigger = await client.query(
    "select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal limit 1"
  );
  if (!trigger.rowCount) missing.push('auth profile trigger');

  return missing;
}

async function applyMigration(client, name, force = false) {
  const file = path.join(root, 'supabase', name);
  if (!fs.existsSync(file)) return;

  if (!force) {
    const applied = await client.query(
      'select 1 from public.pixelship_migrations where name = $1 limit 1',
      [name]
    );
    if (applied.rowCount) return;
  }

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

function repairMigrationsFor(missing) {
  const repair = new Set();
  if (missing.some((item) => item.includes('profiles') || item.includes('posts') || item.includes('likes') || item.includes('comments') || item.includes('follows') || item.includes('generations') || item.includes('storage bucket') || item.includes('auth profile trigger'))) {
    repair.add('schema.sql');
  }
  if (missing.some((item) => item.includes('conversations') || item.includes('messages'))) {
    repair.add('003_conversations.sql');
  }
  if (missing.some((item) => item.includes('blog_posts') || item.includes('notifications'))) {
    repair.add('004_content.sql');
  }
  if (missing.some((item) => item.includes('aspect_ratio'))) {
    repair.add('005_custom_aspect_ratios.sql');
  }
  return [...repair];
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

    const missingBefore = await missingSetup(client);
    if (missingBefore.length) {
      console.log(`Supabase setup is incomplete. Missing: ${missingBefore.join(', ')}`);
      console.log('Running setup repair...');
      for (const name of repairMigrationsFor(missingBefore)) {
        await applyMigration(client, name, true);
      }
    }

    for (const name of migrations) {
      await applyMigration(client, name);
    }

    const missingAfter = await missingSetup(client);
    if (missingAfter.length) {
      throw new Error(`Supabase setup is still incomplete: ${missingAfter.join(', ')}`);
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
