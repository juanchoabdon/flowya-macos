-- Fix: set REPLICA IDENTITY FULL on todos and spaces so that Supabase
-- Realtime delivers UPDATE/DELETE events with the full row payload.
--
-- Without FULL, UPDATE events only include the primary key. The todos
-- RLS policy uses `space_id` (not in the PK) to evaluate whether a
-- subscriber should receive the event. When the MCP updates a todo via
-- the service role, the realtime server tries to evaluate the subscriber's
-- RLS using the partial row — space_id is missing, the check fails
-- silently, and the event is never delivered to the macOS app.
alter table public.todos   replica identity full;
alter table public.spaces  replica identity full;
