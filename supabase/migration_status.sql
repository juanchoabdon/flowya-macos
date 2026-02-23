-- Migration: Change completed boolean to status enum
-- Run this in Supabase SQL Editor

-- Step 1: Add the new status column
ALTER TABLE todos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'backlog';

-- Step 2: Migrate existing data (completed = true -> 'done', false -> 'backlog')
UPDATE todos SET status = CASE 
  WHEN completed = true THEN 'done'
  ELSE 'backlog'
END;

-- Step 3: Add constraint for valid status values (skip if exists)
DO $$ BEGIN
  ALTER TABLE todos ADD CONSTRAINT todos_status_check 
    CHECK (status IN ('backlog', 'in_progress', 'done'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 4: Drop the old completed column (optional - you can keep it for backup)
-- ALTER TABLE todos DROP COLUMN completed;

-- ============================================
-- Migration: Add position column for drag & drop reordering
-- ============================================

-- Step 5: Add the position column
ALTER TABLE todos ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Step 6: Set initial positions based on creation date
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY space_id ORDER BY created_at DESC) as row_num
  FROM todos
)
UPDATE todos SET position = numbered.row_num
FROM numbered WHERE todos.id = numbered.id;

-- Done! Your todos table now supports position for drag & drop reordering

-- ============================================
-- Migration: Add archived column for archiving completed tasks
-- ============================================

-- Step 7: Add the archived column
ALTER TABLE todos ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- Step 8: Create index for faster queries filtering archived
CREATE INDEX IF NOT EXISTS idx_todos_archived ON todos(archived);

-- Done! Your todos table now supports archiving

-- ============================================
-- Migration: Add color column to spaces for workspace theming
-- ============================================

-- Step 9: Add the color column to spaces
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#C7CEEA';

-- Step 10: Set random pastel colors for existing spaces
UPDATE spaces SET color = (
  CASE (random() * 9)::int
    WHEN 0 THEN '#FF9AA2'
    WHEN 1 THEN '#FFB7B2'
    WHEN 2 THEN '#FFDAC1'
    WHEN 3 THEN '#E2F0CB'
    WHEN 4 THEN '#B5EAD7'
    WHEN 5 THEN '#C7CEEA'
    WHEN 6 THEN '#A0D2DB'
    WHEN 7 THEN '#D4A5A5'
    WHEN 8 THEN '#F0E6EF'
    ELSE '#C9CBA3'
  END
) WHERE color IS NULL OR color = '#C7CEEA';

-- Done! Your spaces now have colors

-- ============================================
-- Migration: Add description column to todos
-- ============================================

-- Step 11: Add description column to todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Done! Your todos now support descriptions

-- ============================================
-- Migration: Add all_spaces_color to settings
-- ============================================

-- Step 12: Add all_spaces_color column to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS all_spaces_color TEXT DEFAULT '#64B5F6';

-- Done! Settings now supports color for "All" view

-- ============================================
-- Migration: Add started_at to todos for in_progress ordering
-- ============================================

-- Step 13: Add started_at column to todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL;

-- Done! In progress tasks can now be sorted by when they were started

-- ============================================
-- Migration: Add multi-user support
-- ============================================

-- Step 14: Add user_id column to spaces
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 15: Add user_id column to settings (and change primary key)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 16: Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- Step 17: Drop old RLS policies
DROP POLICY IF EXISTS "Allow all on spaces" ON spaces;
DROP POLICY IF EXISTS "Allow all on todos" ON todos;
DROP POLICY IF EXISTS "Allow all on settings" ON settings;

-- Step 18: Create new RLS policies for multi-user
-- Spaces: users can only see/manage their own spaces
CREATE POLICY "Users manage own spaces" ON spaces 
  FOR ALL USING (auth.uid() = user_id);

-- Todos: users can only see/manage todos in their spaces
CREATE POLICY "Users manage own todos" ON todos 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = todos.space_id 
      AND spaces.user_id = auth.uid()
    )
  );

-- Settings: users can only see/manage their own settings
CREATE POLICY "Users manage own settings" ON settings 
  FOR ALL USING (auth.uid() = user_id);

-- Step 19: Assign existing data to your user
-- Your user_id: 2f03d9aa-2019-4094-a827-f249854a9bfb
UPDATE spaces SET user_id = '2f03d9aa-2019-4094-a827-f249854a9bfb' WHERE user_id IS NULL;
UPDATE settings SET user_id = '2f03d9aa-2019-4094-a827-f249854a9bfb' WHERE user_id IS NULL;

-- Done! Database now supports multiple users and your existing data is assigned to you

-- ============================================
-- Migration: Add nickname to settings
-- ============================================

-- Step 20: Add nickname column to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT NULL;

-- Done! Users can now set a nickname

-- ============================================
-- Migration: Add priority column to todos
-- ============================================

-- Step 21: Add priority column to todos (P0, P1, P2, P3 - default P1)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'P1';

-- Step 22: Add constraint for valid priority values (skip if exists)
DO $$ BEGIN
  ALTER TABLE todos ADD CONSTRAINT todos_priority_check 
    CHECK (priority IN ('P0', 'P1', 'P2', 'P3'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Done! Todos now support priority levels

-- ============================================
-- Migration: Add due_date column to todos
-- ============================================

-- Step 23: Add due_date column to todos (timestamp for hour precision)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ DEFAULT NULL;

-- Done! Todos now support due dates / deadlines with hour precision

-- ============================================
-- Migration: Add changelogs table for What's New
-- ============================================

-- Step 24: Create changelogs table
CREATE TABLE IF NOT EXISTS changelogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  changes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 25: Allow public read access to changelogs (no auth required)
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read changelogs" ON changelogs
  FOR SELECT USING (true);

-- Step 26: Insert initial changelog data
INSERT INTO changelogs (version, date, changes) VALUES
  ('1.0.22', 'Feb 2026', ARRAY[
    'Added ETA/deadlines with visual urgency indicators (yellow/red)',
    'Priority system (P0-P3) with smart auto-positioning',
    'Confirmation modal when moving tasks above P0',
    'Priority filter in Backlog and In Progress views',
    'Rich text editor for task descriptions (links, bullets)',
    'Archive tasks with undo support (⌘+Z)',
    'What''s New & Tips panel'
  ]),
  ('1.0.15', 'Jan 2026', ARRAY[
    'Drag & drop task reordering',
    'Multiple workspaces with colors',
    'Task descriptions with notes',
    'Improved glassmorphism UI'
  ]),
  ('1.0.0', 'Dec 2025', ARRAY[
    'Initial release',
    'Kanban workflow: Backlog → In Progress → Done',
    'Floating always-on-top window',
    'Global hotkey ⌘+⇧+Space'
  ])
ON CONFLICT (version) DO NOTHING;

-- Step 27: Insert 1.0.37 changelog
INSERT INTO changelogs (version, date, changes) VALUES
  ('1.0.37', 'Feb 2026', ARRAY[
    'AI Boost Hub — new entry point for all AI features',
    'Sharpen Task Names — AI rewrites vague tasks into clear actions',
    'Inline AI suggestions when opening any task',
    'AI now considers your roles and context for smarter suggestions',
    'P0 and overdue tasks auto-sort to the top',
    'Confirmation modal when dragging tasks above P0',
    'Smart ETA rescheduling for overdue tasks during AI prioritization'
  ])``````````` 
ON CONFLICT (version) DO NOTHING;

-- Done! Changelogs table created

-- ============================================
-- Migration: Add weekly_goals table for Weekly AI Planning
-- ============================================

-- Step 28: Create weekly_goals table
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  goal_text TEXT NOT NULL,
  position INTEGER NOT NULL,
  linked_todo_id UUID REFERENCES todos(id) ON DELETE SET NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 29: Create index for fast weekly queries
CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_week ON weekly_goals(user_id, week_start);

-- Step 30: Enable RLS on weekly_goals
ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weekly goals" ON weekly_goals
  FOR ALL USING (auth.uid() = user_id);

-- Done! Weekly goals table created for Weekly AI Planning

-- ============================================
-- Migration: Add linked_todo_ids array to weekly_goals
-- ============================================

-- Step 31: Add linked_todo_ids column (array of UUIDs stored as text[])
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS linked_todo_ids TEXT[] DEFAULT '{}';
