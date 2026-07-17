-- Backlog hybrid sort: auto by due_date unless manually reordered (drag / MCP).

alter table public.todos
  add column if not exists manual_order boolean not null default false;

create index if not exists idx_todos_backlog_sort
  on public.todos (space_id, status, manual_order, position)
  where archived = false and status = 'backlog';
