-- ============================================
-- Daily Recurring Tasks - Server-side cron
-- ============================================
-- Creates a PostgreSQL function + pg_cron job that
-- automatically creates todos from recurring_tasks
-- every day at 11:00 AM UTC (5:00 AM Mexico CST).
--
-- Run this in your Supabase SQL Editor.
-- ============================================

-- Enable pg_cron (already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- The function
-- ============================================
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
    -- Shift existing non-archived todos in this space down by 1
    UPDATE todos
    SET position = position + 1
    WHERE space_id = rec.space_id
      AND archived = false;

    -- Insert the new todo at the top (position 0)
    INSERT INTO todos (space_id, text, status, priority, position, created_at)
    VALUES (rec.space_id, rec.text, 'backlog', 'P0', 0, NOW());

    -- Mark as created for today
    UPDATE recurring_tasks
    SET last_created_date = today_str
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ============================================
-- Schedule: every day at 11:00 AM UTC (5:00 AM Mexico CST)
-- ============================================
SELECT cron.schedule(
  'create-daily-recurring-tasks',
  '0 11 * * *',
  $$SELECT create_daily_recurring_tasks()$$
);

-- ============================================
-- Useful commands:
-- ============================================
-- Verify the job:        SELECT * FROM cron.job;
-- Run manually (test):   SELECT create_daily_recurring_tasks();
-- Remove the job:        SELECT cron.unschedule('create-daily-recurring-tasks');
-- Check run history:     SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
