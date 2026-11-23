-- Close the cross-community event leak: the "signed-in read" policies let any
-- authenticated user read every community's events and full RSVP lists.
-- Events fall back to the original member-scoped policy from 0002; RSVPs
-- get a member-scoped replacement so counts keep working for members.
drop policy if exists "signed-in read events" on public.events;
drop policy if exists "signed-in read rsvps" on event_rsvps;

drop policy if exists "Members can read community rsvps" on event_rsvps;
create policy "Members can read community rsvps"
  on event_rsvps for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_rsvps.event_id
        and public.is_community_member(e.community_id)
    )
  );
