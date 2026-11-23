-- Post attachments beyond pictures: videos play inline, files (Word,
-- Excel, PDFs…) download from the post. Existing rows stay 'image'.
alter table public.post_media
  add column if not exists kind text not null default 'image'
  check (kind in ('image', 'video', 'file'));
alter table public.post_media add column if not exists file_name text;
alter table public.post_media add column if not exists file_size integer;
