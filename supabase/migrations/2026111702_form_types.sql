-- Ophixe forms rename: Exit/Travel becomes Leave Request, Relocation
-- becomes Report Staff (report harsh or bad behaviour by a staff member).
-- Existing rows are migrated so history keeps working. Safe to re-run.
update public.form_submissions
set type = 'leave_request'
where type = 'exit_request';

update public.form_submissions
set type = 'staff_report'
where type = 'relocation';

alter table public.form_submissions
  drop constraint if exists form_submissions_type_check;

alter table public.form_submissions
  add constraint form_submissions_type_check check (type in (
    'data_correction', 'leave_request', 'payment_issue',
    'query_response', 'staff_report'
  ));
