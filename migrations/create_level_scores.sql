CREATE TABLE level_scores (
    id SERIAL PRIMARY KEY,
    game_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    score DECIMAL(10,4),
    cluster TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, level)
);
