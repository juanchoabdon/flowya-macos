-- Clear legacy drag pins so backlog auto-sorts by due_date on next app load.
-- Safe to re-run; only affects backlog tasks.

update public.todos
set manual_order = false
where status = 'backlog'
  and archived = false;
