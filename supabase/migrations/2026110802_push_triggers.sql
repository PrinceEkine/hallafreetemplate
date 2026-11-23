-- Push fan-out triggers. Each event calls the push-fanout edge function.
-- Config lives in public.app_settings (see 2026110803_fanout_config.sql):
-- fanout_url is seeded by the migration; set fanout_secret once via the
-- dashboard SQL Editor:
--   update public.app_settings set value = '<FANOUT_SECRET>'
--   where key = 'fanout_secret';
-- Triggers stay silent until both values exist, and never fail a write:
-- delivery errors are swallowed.

create extension if not exists pg_net;

create or replace function post_fanout(payload jsonb)
returns void language plpgsql security definer as $$
declare
  fanout_url text := current_setting('app.settings.fanout_url', true);
  fanout_secret text := current_setting('app.settings.fanout_secret', true);
begin
  if fanout_url is null or fanout_secret is null or fanout_url = '' then
    return;
  end if;
  begin
    perform net.http_post(
      url := fanout_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-fanout-secret', fanout_secret
      ),
      body := payload
    );
  exception when others then
    raise log 'push fanout failed: %', sqlerrm;
  end;
end $$;

create or replace function trg_message_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'message',
    'message_id', new.id,
    'conversation_id', new.conversation_id,
    'sender_id', new.sender_id
  ));
  return new;
end $$;

drop trigger if exists trg_message_fanout on messages;
create trigger trg_message_fanout after insert on messages
  for each row execute function trg_message_fanout();

create or replace function trg_submission_fanout()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform post_fanout(jsonb_build_object(
      'event', 'submission',
      'submission_id', new.id,
      'op', 'INSERT',
      'status', new.status
    ));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform post_fanout(jsonb_build_object(
      'event', 'submission',
      'submission_id', new.id,
      'op', 'UPDATE',
      'status', new.status
    ));
  end if;
  return new;
end $$;

drop trigger if exists trg_submission_fanout on form_submissions;
create trigger trg_submission_fanout
  after insert or update of status on form_submissions
  for each row execute function trg_submission_fanout();

create or replace function trg_announcement_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'announcement',
    'announcement_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_announcement_fanout on announcements;
create trigger trg_announcement_fanout after insert on announcements
  for each row execute function trg_announcement_fanout();

create or replace function trg_task_fanout()
returns trigger language plpgsql as $$
begin
  if new.assignee_id is not null then
    perform post_fanout(jsonb_build_object(
      'event', 'task',
      'task_id', new.id
    ));
  end if;
  return new;
end $$;

drop trigger if exists trg_task_fanout on community_tasks;
create trigger trg_task_fanout after insert on community_tasks
  for each row execute function trg_task_fanout();
