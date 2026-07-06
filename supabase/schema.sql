-- Pixelship initial Supabase schema
-- Run once in Supabase Dashboard > SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default 'New to the Pixelship universe.' check (char_length(bio) <= 240),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  image_url text not null,
  aspect_ratio text not null default '1:1' check (aspect_ratio in ('1:1','4:5','16:9')),
  generation_mode text not null default 'replicate',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  user_prompt text not null,
  enhanced_prompt text,
  blueprint text,
  provider text not null default 'replicate',
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists posts_public_created_idx on public.posts (is_public, created_at desc);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at);
create index if not exists likes_post_idx on public.likes (post_id);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.generations enable row level security;

create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
create policy "users insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "public posts are readable" on public.posts for select to anon, authenticated using (is_public or (select auth.uid()) = user_id);
create policy "users create own posts" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own posts" on public.posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own posts" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "likes are readable" on public.likes for select to anon, authenticated using (true);
create policy "users create own likes" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users delete own likes" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "comments are readable" on public.comments for select to anon, authenticated using (true);
create policy "users create own comments" on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own comments" on public.comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own comments" on public.comments for delete to authenticated using ((select auth.uid()) = user_id);

create policy "follows are readable" on public.follows for select to anon, authenticated using (true);
create policy "users create own follows" on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy "users delete own follows" on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

create policy "users read own generations" on public.generations for select to authenticated using ((select auth.uid()) = user_id);
create policy "users create own generations" on public.generations for insert to authenticated with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creations', 'creations', false, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public;

create policy "signed creation images are readable" on storage.objects for select to anon, authenticated using (bucket_id = 'creations');
create policy "users upload creation images" on storage.objects for insert to authenticated with check (bucket_id = 'creations' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update own creation images" on storage.objects for update to authenticated using (bucket_id = 'creations' and owner_id = (select auth.uid())::text);
create policy "users delete own creation images" on storage.objects for delete to authenticated using (bucket_id = 'creations' and owner_id = (select auth.uid())::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    coalesce(nullif(lower(regexp_replace(new.raw_user_meta_data ->> 'handle', '[^a-z0-9_]', '', 'g')), ''), 'traveler_' || substr(new.id::text, 1, 8)),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Pixelship Traveler')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
