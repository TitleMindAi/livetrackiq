-- Migration 004: Custom goals + trackable goals (Hank Sprint 5 — 2026-04-24)
-- Purpose: Hank wants the Goals tab to support:
--   (1) The 4 base lines (auto/fire/life/disability) — existing `goals` table
--   (2) New trackables: Referral HH Quoted, Google Review Ask, Google Reviews Completed
--   (3) Free-form custom goals (e.g. Investment Statements) with count/premium/closing ratio
--
-- D1/SQLite note: expressions (e.g. COALESCE) are not allowed in inline UNIQUE
-- constraints. We enforce the dual scope (user-scoped vs office-wide) with two
-- partial unique indexes instead.
--
-- Rollback: DROP TABLE custom_goals;

CREATE TABLE IF NOT EXISTS custom_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),    -- NULL = office-wide goal
  office_id INTEGER NOT NULL REFERENCES offices(id),
  period TEXT NOT NULL,                    -- YYYY-MM
  tracker_key TEXT NOT NULL,
  label TEXT NOT NULL,
  count_goal INTEGER NOT NULL DEFAULT 0,
  premium_goal REAL NOT NULL DEFAULT 0,
  closing_ratio REAL NOT NULL DEFAULT 0,   -- 0..1
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_custom_goals_office_period
  ON custom_goals(office_id, period);
CREATE INDEX IF NOT EXISTS idx_custom_goals_user
  ON custom_goals(user_id, period);

-- Uniqueness:
--   (a) per-user: one row per (office, user, period, tracker_key)
--   (b) office-wide: one row per (office, period, tracker_key) when user_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_custom_goals_user
  ON custom_goals(office_id, user_id, period, tracker_key)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_custom_goals_office_wide
  ON custom_goals(office_id, period, tracker_key)
  WHERE user_id IS NULL;
