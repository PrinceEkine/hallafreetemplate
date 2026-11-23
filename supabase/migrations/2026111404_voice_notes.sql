-- Ophixe voice notes: private per-conversation audio attachments.
-- Paths look like {conversation_id}/{message_id}.bin (see lib/voice.ts).
-- Only conversation participants can read or write their thread's notes.
-- Safe to re-run.
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

drop policy if exists "Participants can upload voice notes" on storage.objects;
create policy "Participants can upload voice notes"
  on storage.objects for insert
  with check (
    bucket_id = 'voice-notes'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Participants can read voice notes" on storage.objects;
create policy "Participants can read voice notes"
  on storage.objects for select
  using (
    bucket_id = 'voice-notes'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Participants can delete voice notes" on storage.objects;
create policy "Participants can delete voice notes"
  on storage.objects for delete
  using (
    bucket_id = 'voice-notes'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
