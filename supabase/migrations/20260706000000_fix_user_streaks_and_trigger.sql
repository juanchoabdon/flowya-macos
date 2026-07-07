-- ============================================================
-- Fix user_streaks schema + DB trigger so streaks update
-- regardless of whether a task is completed from the app or MCP.
-- ============================================================

-- 1. Align columns with what useStreak.ts expects
alter table public.user_streaks
  add column if not exists last_completed_at timestamptz,
  add column if not exists best_today        int not null default 0,
  add column if not exists today_date        date;

-- Backfill last_completed_at from old last_completion_date column (date → timestamptz)
update public.user_streaks
  set last_completed_at = last_completion_date::timestamptz
  where last_completion_date is not null
    and last_completed_at is null;

-- 2. Trigger function: called after any todos row UPDATE
--    Only acts when status transitions to 'done'.
create or replace function public.fn_update_streak_on_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id         uuid;
  v_row             public.user_streaks%rowtype;
  v_now             timestamptz := now();
  v_today           date        := current_date;
  v_window_secs     int         := 30 * 60; -- 30 minutes
  v_new_count       int;
  v_new_best        int;
begin
  -- Only fire when status changes TO 'done' (not when already done)
  if NEW.status <> 'done' or OLD.status = 'done' then
    return NEW;
  end if;

  -- Resolve owning user via the space
  select s.user_id into v_user_id
    from public.spaces s
   where s.id = NEW.space_id;

  if v_user_id is null then
    return NEW;
  end if;

  -- Read current streak row (may not exist yet)
  select * into v_row
    from public.user_streaks
   where user_id = v_user_id;

  if not found then
    v_new_count := 1;
    v_new_best  := 1;
  else
    -- Streak continues if last completion was within the window
    if v_row.last_completed_at is not null
       and extract(epoch from (v_now - v_row.last_completed_at)) <= v_window_secs then
      v_new_count := v_row.streak_count + 1;
    else
      v_new_count := 1;
    end if;

    -- best_today resets each calendar day
    if v_row.today_date = v_today then
      v_new_best := greatest(v_row.best_today, v_new_count);
    else
      v_new_best := v_new_count;
    end if;
  end if;

  insert into public.user_streaks (
    user_id, streak_count, best_today, last_completed_at, today_date
  )
  values (v_user_id, v_new_count, v_new_best, v_now, v_today)
  on conflict (user_id) do update set
    streak_count      = excluded.streak_count,
    best_today        = excluded.best_today,
    last_completed_at = excluded.last_completed_at,
    today_date        = excluded.today_date;

  return NEW;
end;
$$;

-- 3. Attach trigger to todos (drop first to allow idempotent re-runs)
drop trigger if exists trg_streak_on_done on public.todos;
create trigger trg_streak_on_done
  after update on public.todos
  for each row
  execute function public.fn_update_streak_on_done();

-- 4. Make sure user_streaks is in the Realtime publication
--    (safe to run even if already present)
do $$
begin
  alter publication supabase_realtime add table public.user_streaks;
exception when others then
  null; -- already in publication
end;
$$;
