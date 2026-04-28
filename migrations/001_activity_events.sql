-- Migration 001: activity_events table (Hank v2 — 2026-04-24)
-- Purpose: Decouple daily counters from product lines.
-- Legacy `daily_activity` stays untouched for backwards compatibility.
-- Feature-flagged on client (ff_log_activities). Safe to run before UI flip.
--
-- 8 trackable types:
--   auto_quote, fire_quote, life_presentation, disability_presentation,
--   submitted_app, google_review_completed, google_review_ask, referral_hh_quoted
--
-- Rollback: DROP TABLE activity_events;

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  office_id INTEGER NOT NULL REFERENCES offices(id),
  activity_date TEXT NOT NULL,      -- YYYY-MM-DD
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'auto_quote', 'fire_quote', 'life_presentation', 'disability_presentation',
    'submitted_app', 'google_review_completed', 'google_review_ask', 'referral_hh_quoted'
  )),
  count INTEGER NOT NULL DEFAULT 0,
  -- Optional metadata for richer rows (log-per-event vs aggregated daily)
  customer_name TEXT,
  lead_source TEXT,
  lead_temperature TEXT,            -- hot|medium|cold (null for submitted_app)
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_date
  ON activity_events(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_activity_events_type
  ON activity_events(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_office_date
  ON activity_events(office_id, activity_date);
