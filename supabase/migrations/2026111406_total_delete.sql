-- Ophixe total community delete: notifications go with the community
-- (every other community table already cascades), and community admins
-- can remove their community's stored files so buckets don't keep orphans.
-- Safe to re-run. Requires 2026111405_community_exit.sql.

create or replace function public._destroy_community(p_community uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Groups are deleted explicitly for clarity (the FK would cascade them
  -- anyway); scoped DMs cascade with the community as well.
  delete from public.conversations
  where community_id = p_community and is_group = true;
  -- Notifications otherwise survive with a nulled community_id.
  delete from public.notifications where community_id = p_community;
  delete from public.communities where id = p_community;
end;
$$;

revoke all on function public._destroy_community(uuid)
  from public, anon, authenticated;

-- Community file cleanup on delete: admins can remove objects stored
-- under their community's folders (media, files, evidence, post-media).
drop policy if exists "Community admins can delete community files"
  on storage.objects;
create policy "Community admins can delete community files"
  on storage.objects for delete
  using (
    bucket_id in ('community-media', 'community-files', 'evidence', 'post-media')
    and public.is_community_admin(((storage.foldername(name))[1])::uuid)
  );

-- Community logos live at avatars/community-logos/{community_id}/...
drop policy if exists "Community admins can delete community logos"
  on storage.objects;
create policy "Community admins can delete community logos"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'community-logos'
    and public.is_community_admin(((storage.foldername(name))[2])::uuid)
  );
