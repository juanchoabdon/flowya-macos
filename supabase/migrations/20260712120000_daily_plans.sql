-- Daily Plans as first-class Flowya objects
-- Spec: projects/flowya/specs/daily-plans-as-a-first-class-flowya-object.md

-- ============================================================
-- 1. daily_plans
-- ============================================================
create table if not exists public.daily_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan_date     date not null,
  timezone      text not null default 'America/Mexico_City',
  status        text not null default 'draft'
                  check (status in ('draft', 'confirmed', 'closed')),
  capacity      text check (capacity in ('light', 'normal', 'packed')),
  summary       text,
  confirmed_at  timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index if not exists idx_daily_plans_user_date on public.daily_plans (user_id, plan_date);

alter table public.daily_plans enable row level security;

create policy "Users manage own daily plans"
  on public.daily_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. daily_plan_items
-- ============================================================
create table if not exists public.daily_plan_items (
  id            uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  task_id       uuid not null references public.todos(id) on delete cascade,
  bucket        text not null
                  check (bucket in ('deadline', 'active', 'follow_up', 'habit')),
  position      integer not null default 0,
  added_at      timestamptz not null default now(),
  removed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One active row per (plan, task)
create unique index if not exists idx_daily_plan_items_active_unique
  on public.daily_plan_items (daily_plan_id, task_id)
  where removed_at is null;

create index if not exists idx_daily_plan_items_plan
  on public.daily_plan_items (daily_plan_id, position)
  where removed_at is null;

alter table public.daily_plan_items enable row level security;

create policy "Users manage own daily plan items"
  on public.daily_plan_items for all
  using (
    exists (
      select 1 from public.daily_plans p
      where p.id = daily_plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_plans p
      where p.id = daily_plan_id and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. daily_plan_revisions
-- ============================================================
create table if not exists public.daily_plan_revisions (
  id              uuid primary key default gen_random_uuid(),
  daily_plan_id   uuid not null references public.daily_plans(id) on delete cascade,
  revision_number integer not null,
  reason          text,
  before_items    jsonb not null default '[]',
  after_items     jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  created_by      text not null default 'agent'
                    check (created_by in ('user', 'agent', 'app')),
  unique (daily_plan_id, revision_number)
);

alter table public.daily_plan_revisions enable row level security;

create policy "Users read own daily plan revisions"
  on public.daily_plan_revisions for select
  using (
    exists (
      select 1 from public.daily_plans p
      where p.id = daily_plan_id and p.user_id = auth.uid()
    )
  );

-- Realtime for macOS live updates
do $$
begin
  alter publication supabase_realtime add table public.daily_plans;
exception when others then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.daily_plan_items;
exception when others then null;
end;
$$;

alter table public.daily_plans replica identity full;
alter table public.daily_plan_items replica identity full;
