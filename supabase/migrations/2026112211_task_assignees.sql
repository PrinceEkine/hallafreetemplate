-- Multi-assign tasks: a task can belong to several people.
-- community_tasks.assignee_id stays as the first assignee for old clients.
create table if not exists public.task_assignees (
  task_id uuid not null references public.community_tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

insert into public.task_assignees (task_id, user_id)
select id, assignee_id
from public.community_tasks
where assignee_id is not null
on conflict do nothing;

alter table public.task_assignees enable row level security;

drop policy if exists "Members can read task assignees" on public.task_assignees;
create policy "Members can read task assignees"
  on public.task_assignees for select
  using (
    exists (
      select 1 from public.community_tasks t
      where t.id = task_id and is_community_member(t.community_id)
    )
  );

drop policy if exists "Members can write task assignees" on public.task_assignees;
create policy "Members can write task assignees"
  on public.task_assignees for insert
  with check (
    exists (
      select 1 from public.community_tasks t
      where t.id = task_id and is_community_member(t.community_id)
    )
  );

drop policy if exists "Members can delete task assignees" on public.task_assignees;
create policy "Members can delete task assignees"
  on public.task_assignees for delete
  using (
    exists (
      select 1 from public.community_tasks t
      where t.id = task_id and is_community_member(t.community_id)
    )
  );
