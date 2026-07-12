-- Enable Realtime for weekly_goals (planning panel live updates)

do $$
begin
  alter publication supabase_realtime add table public.weekly_goals;
exception when others then null;
end;
$$;

alter table public.weekly_goals replica identity full;
