-- LeetPlacards Supabase/PostgreSQL schema
--
-- The backend creates and migrates these tables automatically on startup, so
-- running this by hand is optional. It is kept in sync with backend/app/models.py
-- for anyone who prefers to provision the schema up front (Supabase SQL Editor
-- or psql against an external Postgres).

-- One row per GitHub account.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token TEXT,
    repo_owner TEXT,
    repo_name TEXT,
    leetcode_path_prefix TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
-- A repo maps to exactly one user so push webhooks resolve unambiguously.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_repo ON users(repo_owner, repo_name)
    WHERE repo_owner IS NOT NULL AND repo_name IS NOT NULL;

-- Flashcards, scoped per user.
CREATE TABLE IF NOT EXISTS placards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_name TEXT NOT NULL,
    github_file_path TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Medium',
    pattern TEXT,
    description TEXT DEFAULT '',
    example TEXT DEFAULT '',
    summary TEXT,
    approach TEXT,
    time_complexity TEXT,
    space_complexity TEXT,
    recognition_clues TEXT DEFAULT '',
    core_insight TEXT DEFAULT '',
    why_it_works TEXT DEFAULT '',
    complexity TEXT DEFAULT '',
    common_mistakes TEXT DEFAULT '',
    transfer_question TEXT DEFAULT '',
    user_approach TEXT DEFAULT '',
    optimization_verdict TEXT DEFAULT '',
    better_approach TEXT DEFAULT '',
    user_time_complexity TEXT DEFAULT '',
    user_space_complexity TEXT DEFAULT '',
    better_time_complexity TEXT DEFAULT '',
    better_space_complexity TEXT DEFAULT '',
    plain_explanation TEXT DEFAULT '',
    dry_run TEXT DEFAULT '',
    naive_approach TEXT DEFAULT '',
    invariant TEXT DEFAULT '',
    pseudocode TEXT DEFAULT '',
    code TEXT,
    mastered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placards_user_created ON placards(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_placards_user_github_path
    ON placards(user_id, github_file_path);

-- Sync bookkeeping: last processed commit and resync progress, keyed per user
-- (e.g. "last_commit:{user_id}", "resync:{user_id}").
CREATE TABLE IF NOT EXISTS worker_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
