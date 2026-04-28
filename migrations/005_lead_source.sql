-- Migration 005: Persist lead_source on customers + applications (P0 — 2026-04-24)
-- Purpose: The Submit App screen + Intake API was collecting leadSource but the
-- POST /apps handler dropped it on the floor — no column existed to store it.
-- This migration adds the column on both customers and applications so we can:
--   (a) snapshot the source on each app row (for analytics by source over time),
--   (b) keep the customer's most recent source for quick dashboards.
--
-- Rollback:
--   ALTER TABLE applications DROP COLUMN lead_source;
--   ALTER TABLE customers    DROP COLUMN lead_source;

ALTER TABLE applications ADD COLUMN lead_source TEXT;
ALTER TABLE customers    ADD COLUMN lead_source TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_lead_source ON applications(lead_source);
CREATE INDEX IF NOT EXISTS idx_customers_lead_source    ON customers(lead_source);
