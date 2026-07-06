-- Pixelship privacy migration
alter table public.posts alter column is_public set default false;
update storage.buckets set public = false where id = 'creations';
