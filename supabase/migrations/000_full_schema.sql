-- ============================================
-- Flowya - Full Database Schema
-- ============================================
-- Run this in your new Supabase project's SQL Editor
-- to recreate the entire database from scratch.
-- ============================================

-- ============================================
-- 1. SPACES
-- ============================================
create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#64B5F6',
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table spaces enable row level security;

create policy "Users can manage their own spaces"
  on spaces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_spaces_user on spaces(user_id, position);

-- ============================================
-- 2. TODOS
-- ============================================
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  text text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'in_progress', 'done')),
  priority text not null default 'P1' check (priority in ('P0', 'P1', 'P2', 'P3')),
  due_date timestamptz,
  position int not null default 0,
  archived boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table todos enable row level security;

create policy "Users can manage their own todos"
  on todos for all
  using (
    exists (
      select 1 from spaces where spaces.id = todos.space_id and spaces.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from spaces where spaces.id = todos.space_id and spaces.user_id = auth.uid()
    )
  );

create index idx_todos_space on todos(space_id, archived, position);
create index idx_todos_status on todos(space_id, status, archived);

-- ============================================
-- 3. SETTINGS
-- ============================================
create table if not exists settings (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  always_on_top boolean not null default true,
  visible_on_all_workspaces boolean not null default true,
  opacity float not null default 1.0,
  last_selected_space text,
  all_spaces_color text default '#64B5F6',
  nickname text,
  ai_roles jsonb,
  ai_context text,
  ai_setup_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table settings enable row level security;

create policy "Users can manage their own settings"
  on settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================
-- 4. NOTES
-- ============================================
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null default '',
  content text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy "Users can manage their own notes"
  on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_notes_space on notes(space_id, position);
create index idx_notes_user on notes(user_id);

-- ============================================
-- 5. WEEKLY GOALS
-- ============================================
create table if not exists weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references spaces(id) on delete cascade,
  week_start date not null,
  goal_text text not null,
  position int not null default 0,
  linked_todo_id uuid references todos(id) on delete set null,
  linked_todo_ids uuid[] not null default '{}',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table weekly_goals enable row level security;

create policy "Users can manage their own weekly goals"
  on weekly_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_weekly_goals_user_week on weekly_goals(user_id, week_start);

-- ============================================
-- 6. RECURRING TASKS
-- ============================================
create table if not exists recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references spaces(id) on delete cascade,
  text text not null,
  days int[] not null default '{}',
  enabled boolean not null default true,
  last_created_date text,
  created_at timestamptz not null default now()
);

alter table recurring_tasks enable row level security;

create policy "Users can manage their own recurring tasks"
  on recurring_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_recurring_tasks_user on recurring_tasks(user_id);

-- ============================================
-- 7. CHANGELOGS
-- ============================================
create table if not exists changelogs (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  date text not null,
  changes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table changelogs enable row level security;

create policy "Anyone can read changelogs"
  on changelogs for select
  using (true);

-- ============================================
-- 8. USER STREAKS
-- ============================================
create table if not exists user_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  streak_count int not null default 0,
  best_streak int not null default 0,
  last_completion_date date,
  created_at timestamptz not null default now()
);

alter table user_streaks enable row level security;

create policy "Users can manage their own streaks"
  on user_streaks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================
-- 9. DEVICE TOKENS (Push Notifications)
-- ============================================
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  created_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table device_tokens enable row level security;

create policy "Users can manage their own device tokens"
  on device_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================
-- 10. LIVE ACTIVITY TOKENS
-- ============================================
create table if not exists live_activity_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

alter table live_activity_tokens enable row level security;

create policy "Users can manage their own LA tokens"
  on live_activity_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================
-- 11. REALTIME - Enable for live sync
-- ============================================
alter publication supabase_realtime add table spaces;
alter publication supabase_realtime add table todos;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table settings;

-- ============================================
-- 12. RECURRING TASKS CRON (pg_cron)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION create_daily_recurring_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  today_str TEXT;
  today_dow INT;
BEGIN
  today_str := TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD');
  today_dow := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Mexico_City')::INT;

  FOR rec IN
    SELECT id, space_id, text
    FROM recurring_tasks
    WHERE enabled = true
      AND today_dow = ANY(days)
      AND (last_created_date IS NULL OR last_created_date != today_str)
  LOOP
    UPDATE todos
    SET position = position + 1
    WHERE space_id = rec.space_id
      AND archived = false;

    INSERT INTO todos (space_id, text, status, priority, position, created_at)
    VALUES (rec.space_id, rec.text, 'backlog', 'P0', 0, NOW());

    UPDATE recurring_tasks
    SET last_created_date = today_str
    WHERE id = rec.id;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'create-daily-recurring-tasks',
  '0 11 * * *',
  $$SELECT create_daily_recurring_tasks()$$
);
