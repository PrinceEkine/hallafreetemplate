-- Event video banners: record whether banner_url points at an image or a video.
alter table public.events
  add column if not exists banner_kind text not null default 'image';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_banner_kind_check'
  ) then
    alter table public.events
      add constraint events_banner_kind_check
      check (banner_kind in ('image', 'video'));
  end if;
end
$$;
