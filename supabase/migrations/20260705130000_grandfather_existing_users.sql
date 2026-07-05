-- Grandfather every EXISTING Flowya user into Pro for 3 months.
--
-- Run once at monetization launch: users who already exist keep full access
-- (MCP + mobile) free until grandfather_until. is_pro() reads this date and
-- flips them back to free automatically when it lapses — no cron needed.
-- New sign-ups after this point are NOT grandfathered (they start free).
-- Idempotent: on_conflict do nothing, so re-running never extends anyone.

do $$
declare n int;
begin
  insert into public.entitlements (user_id, status, source, grandfather_until)
  select id, 'grandfathered', 'grandfather', now() + interval '3 months'
  from auth.users
  on conflict (user_id) do nothing;

  get diagnostics n = row_count;
  raise notice 'grandfathered % existing users for 3 months (until %)', n, (now() + interval '3 months');
end $$;
