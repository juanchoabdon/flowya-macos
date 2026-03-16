-- NeosTasks Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SPACES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TODOS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for faster queries by space
CREATE INDEX IF NOT EXISTS idx_todos_space_id ON todos(space_id);
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC);

-- ============================================
-- SETTINGS TABLE (single row)
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensures only one row
  always_on_top BOOLEAN DEFAULT TRUE,
  visible_on_all_workspaces BOOLEAN DEFAULT TRUE,
  opacity REAL DEFAULT 1.0 CHECK (opacity >= 0.3 AND opacity <= 1.0),
  last_selected_space UUID REFERENCES spaces(id) ON DELETE SET NULL
);

-- Insert default settings row
INSERT INTO settings (id, always_on_top, visible_on_all_workspaces, opacity)
VALUES (1, true, true, 1.0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (disabled for single user)
-- ============================================
-- Since this is a single-user personal app, we disable RLS
-- and allow all operations. For production multi-user apps,
-- you would enable RLS and add proper policies.

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single user mode)
CREATE POLICY "Allow all on spaces" ON spaces FOR ALL USING (true);
CREATE POLICY "Allow all on todos" ON todos FOR ALL USING (true);
CREATE POLICY "Allow all on settings" ON settings FOR ALL USING (true);

-- ============================================
-- SAMPLE DATA (optional)
-- ============================================
-- Uncomment to insert sample data:

-- INSERT INTO spaces (name) VALUES ('Personal'), ('Work'), ('Shopping');

-- INSERT INTO todos (space_id, text)
-- SELECT id, 'Welcome to NeosTasks! ✨'
-- FROM spaces WHERE name = 'Personal';

-- ============================================
-- DEVICE TOKENS TABLE (push notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android', 'web')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own device tokens"
    ON device_tokens
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- RECURRING TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recurring_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    days INT[] NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_created_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user_id ON recurring_tasks(user_id);

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring tasks"
    ON recurring_tasks
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- USER STREAKS TABLE (cross-platform sync)
-- ============================================
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_count INT NOT NULL DEFAULT 0,
    last_completed_at TIMESTAMPTZ,
    best_today INT NOT NULL DEFAULT 0,
    today_date TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own streaks"
    ON user_streaks
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_streaks REPLICA IDENTITY FULL;

-- ============================================
-- DAILY RECURRING TASKS CRON
-- ============================================
-- See migrations/create_daily_recurring_tasks_cron.sql
-- Creates a pg_cron job that auto-creates todos from
-- recurring_tasks every day at 5:00 AM UTC.
