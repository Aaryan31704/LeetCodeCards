-- LeetPlacards Supabase/PostgreSQL schema
-- Run this in Supabase SQL Editor or via psql if using external Postgres.

CREATE TABLE IF NOT EXISTS placards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_name TEXT NOT NULL,
    github_file_path TEXT NOT NULL,
    pattern TEXT,
    summary TEXT,
    approach TEXT,
    time_complexity TEXT,
    space_complexity TEXT,
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placards_created_at ON placards(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_placards_github_path ON placards(github_file_path);

CREATE TABLE IF NOT EXISTS worker_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
