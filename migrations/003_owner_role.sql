-- Migration 003: Owner-only Admin gate (Hank Sprint 4 — 2026-04-24)
-- Purpose: Hank wants Admin tab visible only to him, hidden for everyone else.
-- Adds is_owner flag (default 0). Set Hank's row to 1 manually post-migration:
--   UPDATE users SET is_owner = 1 WHERE email = 'hank@<office>';
--
-- Server respects is_owner=1 + role='admin' for full owner privileges.
-- Existing admin/team_leader role still grants management UI but Admin tab is owner-only.
--
-- Rollback: ALTER TABLE users DROP COLUMN is_owner;

ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_owner ON users(is_owner);
