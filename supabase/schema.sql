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
