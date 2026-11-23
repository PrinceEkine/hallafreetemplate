-- Group/team profile: icon + about, editable by community admins.
alter table public.conversations
  add column if not exists about text;
alter table public.conversations
  add column if not exists avatar_url text;

drop policy if exists "Community admins can edit groups" on public.conversations;
create policy "Community admins can edit groups"
  on public.conversations for update
  using (
    is_group = true
    and community_id is not null
    and is_community_admin(community_id)
  )
  with check (
    is_group = true
    and community_id is not null
    and is_community_admin(community_id)
  );

insert into storage.buckets (id, name, public) values
  ('group-avatars', 'group-avatars', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read group avatars') then
    create policy "public read group avatars" on storage.objects for select to public
      using (bucket_id = 'group-avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'signed-in write group avatars') then
    create policy "signed-in write group avatars" on storage.objects for insert to authenticated
      with check (bucket_id = 'group-avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'signed-in update group avatars') then
    create policy "signed-in update group avatars" on storage.objects for update to authenticated
      using (bucket_id = 'group-avatars')
      with check (bucket_id = 'group-avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'signed-in delete group avatars') then
    create policy "signed-in delete group avatars" on storage.objects for delete to authenticated
      using (bucket_id = 'group-avatars');
  end if;
end
$$;
