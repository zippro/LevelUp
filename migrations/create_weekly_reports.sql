-- Weekly Reports table for saved weekly check reports
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    report_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_weekly_reports_game_id ON weekly_reports(game_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_date ON weekly_reports(report_date DESC);
