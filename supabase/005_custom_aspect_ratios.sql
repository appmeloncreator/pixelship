alter table public.posts
  drop constraint if exists posts_aspect_ratio_check;

alter table public.posts
  add constraint posts_aspect_ratio_check
  check (
    aspect_ratio ~ '^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*):(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$'
  );
