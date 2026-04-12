-- Notes table for the Notes view mode
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

-- RLS policies
alter table notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'notes' and policyname = 'Users can manage their own notes'
  ) then
    create policy "Users can manage their own notes"
      on notes for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Index for fast lookups by space
create index if not exists idx_notes_space on notes(space_id, position);
create index if not exists idx_notes_user on notes(user_id);
