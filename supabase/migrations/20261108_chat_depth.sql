-- Chat depth: replies and reactions. Idempotent, safe to re-run.

alter table messages add column if not exists reply_to uuid
  references messages(id) on delete set null;
create index if not exists idx_messages_reply_to on messages (reply_to);

create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists idx_reactions_message
  on message_reactions (message_id);

alter table message_reactions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'participant read reactions') then
    create policy "participant read reactions" on message_reactions
      for select to authenticated
      using (
        exists (
          select 1 from messages m
          join conversation_participants p on p.conversation_id = m.conversation_id
          where m.id = message_reactions.message_id and p.user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'participant write reactions') then
    create policy "participant write reactions" on message_reactions
      for insert to authenticated
      with check (
        message_reactions.user_id = auth.uid()
        and exists (
          select 1 from messages m
          join conversation_participants p on p.conversation_id = m.conversation_id
          where m.id = message_reactions.message_id and p.user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_reactions' and policyname = 'own reaction delete') then
    create policy "own reaction delete" on message_reactions
      for delete to authenticated
      using (message_reactions.user_id = auth.uid());
  end if;
end $$;
