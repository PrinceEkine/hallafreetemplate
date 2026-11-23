-- Photo posts carry no caption: allow empty post text at the database
-- level. The app still requires text OR at least one picture, so fully
-- empty posts stay impossible; the check only guards the length now.
-- Run: supabase db push

alter table public.posts drop constraint if exists posts_text_check;
alter table public.posts
  add constraint posts_text_check check (char_length(text) between 0 and 2000);
