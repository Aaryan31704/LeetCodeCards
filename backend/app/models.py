"""Database models (table definitions). Users and Placards."""

import uuid

PLACARDS_TABLE = "placards"
USERS_TABLE = "users"

# Users: one row per GitHub account
CREATE_USERS_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token TEXT,
    repo_owner TEXT,
    repo_name TEXT,
    leetcode_path_prefix TEXT DEFAULT 'LeetCode',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_repo ON users(repo_owner, repo_name) WHERE repo_owner IS NOT NULL AND repo_name IS NOT NULL;
"""

# Placards: per-user; unique (user_id, github_file_path)
CREATE_PLACARDS_SQL = """
CREATE TABLE IF NOT EXISTS placards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_placards_user_created ON placards(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_placards_user_github_path ON placards(user_id, github_file_path);
"""

# Worker state: last processed commit per user (key = last_commit:{user_id})
CREATE_WORKER_STATE_SQL = """
CREATE TABLE IF NOT EXISTS worker_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# Migration: add user_id to placards if table exists without it (existing deployments)
ALTER_PLACARDS_ADD_USER_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'placards')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'placards' AND column_name = 'user_id') THEN
        ALTER TABLE placards ADD COLUMN user_id UUID REFERENCES users(id);
    END IF;
END $$;
"""
# Drop old single-column unique index and ensure new (user_id, github_file_path) index exists
MIGRATE_PLACARDS_INDEX_SQL = """
DROP INDEX IF EXISTS idx_placards_github_path;
CREATE UNIQUE INDEX IF NOT EXISTS idx_placards_user_github_path ON placards(user_id, github_file_path);
"""

# v2 migration: add difficulty, description, mastered columns
MIGRATE_PLACARDS_V2_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'placards' AND column_name = 'difficulty') THEN
        ALTER TABLE placards ADD COLUMN difficulty TEXT DEFAULT 'Medium';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'placards' AND column_name = 'description') THEN
        ALTER TABLE placards ADD COLUMN description TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'placards' AND column_name = 'mastered') THEN
        ALTER TABLE placards ADD COLUMN mastered BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
"""

# v3 migration: add example column for LeetCode input/output examples
MIGRATE_PLACARDS_V3_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'placards' AND column_name = 'example') THEN
        ALTER TABLE placards ADD COLUMN example TEXT DEFAULT '';
    END IF;
END $$;
"""
