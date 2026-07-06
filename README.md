# pixelship
A self hostable superior AI agentic image generation interface.

This directory is independent from the hosted Pixelship project. It reads credentials only from `config.env`.

## Setup

1. Create a Supabase project.
2. Docker automatically applies these migrations on startup (manual installs may run them in SQL Editor):
   - `supabase/schema.sql`
   - `supabase/002_private_by_default.sql`
   - `supabase/003_conversations.sql`
   - `supabase/004_content.sql`
3. Open `config.env` and replace the placeholders with your own Replicate and Supabase credentials.
4. Install and start:

```powershell
npm.cmd install
npm.cmd start
```

Open `http://localhost:3000`. Change `PORT` in `config.env` when needed. The server binds to `0.0.0.0` for Docker, LAN, and VPS hosting. Docker checks and configures the Supabase schema, policies, triggers, private Storage bucket, and content tables before every launch; completed migrations are recorded and not rerun.

## Required configuration

- `REPLICATE_API_TOKEN`
- `SUPABASE_DB_URL` (Session pooler or direct Postgres URI; used for automatic migrations)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

`SERPER_API_KEY` is optional and only needed for web references.

Never publish `config.env`; it is excluded by `.gitignore`.

## Docker

Build the image without embedding secrets:

```powershell
docker build -t pixelship-self-hosted .
```

Run it from PowerShell:

```powershell
$ConfigPath = Join-Path (Get-Location) "config.env"
docker run --rm -p 3000:3000 --mount "type=bind,source=$ConfigPath,target=/app/config.env,readonly" pixelship-self-hosted
```

Run it from Windows Command Prompt:

```cmd
docker run --rm -p 3000:3000 --mount type=bind,source="%cd%\config.env",target=/app/config.env,readonly pixelship-self-hosted
```

Run it from Linux/macOS:

```bash
docker run --rm -p 3000:3000 --mount type=bind,source="$(pwd)/config.env",target=/app/config.env,readonly pixelship-self-hosted
```
