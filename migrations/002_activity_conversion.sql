-- Migration 002: Quote → App conversion tracking (Hank v2 — Sprint 2)
-- Purpose: When a logged quote/presentation activity is "converted" to a Submitted App,
-- store the resulting application id so the activity row can be marked closed and we can
-- reconcile counts (open quotes vs. converted).
--
-- Depends on: 001_activity_events.sql
-- Rollback: ALTER TABLE activity_events DROP COLUMN converted_app_id; (manual reseed recommended)

ALTER TABLE activity_events ADD COLUMN converted_app_id INTEGER REFERENCES applications(id);

CREATE INDEX IF NOT EXISTS idx_activity_events_converted
  ON activity_events(converted_app_id);

-- Helps the open-quotes query (unconverted quote/presentation rows)
CREATE INDEX IF NOT EXISTS idx_activity_events_open
  ON activity_events(office_id, activity_type, converted_app_id);
