-- Ophixe tester releases: public bucket hosting the CI-built APK at a
-- stable URL. CI uploads with the service key; anyone can download.
-- Safe to re-run.
insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do nothing;

drop policy if exists "Releases are publicly readable" on storage.objects;
create policy "Releases are publicly readable"
  on storage.objects for select
  using (bucket_id = 'releases');
