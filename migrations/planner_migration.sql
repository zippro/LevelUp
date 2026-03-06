-- ================================================
-- Planner Feature Migration
-- ================================================

-- 1. Planner Columns (configurable headings like Feature, LiveOps, UA, etc.)
CREATE TABLE IF NOT EXISTS planner_columns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Planner Actions (configurable statuses like Done, Planning, Off, To Do)
CREATE TABLE IF NOT EXISTS planner_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  date_mode text NOT NULL DEFAULT 'none' CHECK (date_mode IN ('none', 'optional', 'required')),
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Planner Cells (intersection of game + column, stores action + optional date)
CREATE TABLE IF NOT EXISTS planner_cells (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id text NOT NULL,
  column_id uuid REFERENCES planner_columns(id) ON DELETE CASCADE,
  action_id uuid REFERENCES planner_actions(id) ON DELETE SET NULL,
  date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, column_id)
);

-- 4. Planner Schedule (intersection of game + week, stores action + optional date)
CREATE TABLE IF NOT EXISTS planner_schedule (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id text NOT NULL,
  week_start date NOT NULL,
  action_id uuid REFERENCES planner_actions(id) ON DELETE SET NULL,
  date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, week_start)
);

-- 5. Planner Game Order (persisted row ordering for games in planner)
CREATE TABLE IF NOT EXISTS planner_game_order (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id text NOT NULL UNIQUE,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ================================================
-- Enable RLS
-- ================================================
ALTER TABLE planner_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_game_order ENABLE ROW LEVEL SECURITY;

-- ================================================
-- RLS Policies (matching existing app_versions pattern)
-- ================================================
CREATE POLICY "Allow all access to planner_columns"
ON planner_columns FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to planner_actions"
ON planner_actions FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to planner_cells"
ON planner_cells FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to planner_schedule"
ON planner_schedule FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all access to planner_game_order"
ON planner_game_order FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ================================================
-- Indexes for common queries
-- ================================================
CREATE INDEX IF NOT EXISTS idx_planner_cells_game ON planner_cells(game_id);
CREATE INDEX IF NOT EXISTS idx_planner_schedule_game ON planner_schedule(game_id);
CREATE INDEX IF NOT EXISTS idx_planner_schedule_week ON planner_schedule(week_start);
