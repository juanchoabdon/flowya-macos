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
