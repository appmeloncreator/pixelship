-- Pixelship persistent chatbot conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New creation' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 10000),
  post_id uuid references public.posts(id) on delete set null,
  source_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on public.conversations(user_id,updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy "users read own conversations" on public.conversations for select to authenticated using ((select auth.uid())=user_id);
create policy "users create own conversations" on public.conversations for insert to authenticated with check ((select auth.uid())=user_id);
create policy "users update own conversations" on public.conversations for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "users delete own conversations" on public.conversations for delete to authenticated using ((select auth.uid())=user_id);
create policy "users read own messages" on public.messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
create policy "users create own messages" on public.messages for insert to authenticated with check (exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())) and (user_id is null or user_id=(select auth.uid())));
