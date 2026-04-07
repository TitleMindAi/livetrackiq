-- LiveTrackIQ (ChaRM) — Full Schema (All Phases)
-- Cloudflare D1 (SQLite)

-- ============================================
-- CORE: Offices, Users, Sessions
-- ============================================

CREATE TABLE IF NOT EXISTS offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'team_leader', 'admin', 'sales_specialist')),
  office_id INTEGER NOT NULL REFERENCES offices(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  google_access_token TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- PHASE 1: App Intake + Goal Calculator
-- ============================================

-- Customer-name-first approach: one customer → many applications
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Each submitted application line (one row per product type)
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  line TEXT NOT NULL CHECK (line IN ('auto', 'fire', 'life', 'disability')),
  product_type TEXT NOT NULL,
  premium REAL NOT NULL DEFAULT 0,
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  office_id INTEGER NOT NULL REFERENCES offices(id)
);

CREATE INDEX idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX idx_applications_submitted_by ON applications(submitted_by);
CREATE INDEX idx_applications_line ON applications(line);
CREATE INDEX idx_applications_office ON applications(office_id);

-- Per-user goals by line, per period (month)
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  line TEXT NOT NULL CHECK (line IN ('auto', 'fire', 'life', 'disability')),
  app_goal INTEGER NOT NULL DEFAULT 0,
  premium_goal REAL NOT NULL DEFAULT 0,
  period TEXT NOT NULL, -- YYYY-MM format
  UNIQUE(user_id, line, period)
);

-- Per-user closing ratios (overridable per person)
CREATE TABLE IF NOT EXISTS closing_ratios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  line TEXT NOT NULL CHECK (line IN ('auto', 'fire', 'life', 'disability')),
  ratio REAL NOT NULL,
  UNIQUE(user_id, line)
);

-- ============================================
-- PHASE 2: Lead Temperature System
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  temperature TEXT NOT NULL CHECK (temperature IN ('hot', 'medium', 'cold')),
  assigned_to INTEGER REFERENCES users(id),
  notes TEXT,
  is_closed INTEGER NOT NULL DEFAULT 0,  -- auto-closes when app submitted
  closed_at TEXT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_leads_temperature ON leads(temperature);
CREATE INDEX idx_leads_office ON leads(office_id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- ============================================
-- PHASE 3: Bonus Estimator (stubbed — awaiting plan doc)
-- ============================================

CREATE TABLE IF NOT EXISTS bonus_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  plan_data TEXT NOT NULL DEFAULT '{}', -- JSON: thresholds, multipliers, rules
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bonus_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES bonus_plans(id),
  period TEXT NOT NULL,  -- YYYY-MM
  snapshot_data TEXT NOT NULL DEFAULT '{}', -- JSON: projected, what-if, actual
  calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- PHASE 4: Activity Tracking for Reporting
-- ============================================

CREATE TABLE IF NOT EXISTS daily_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  activity_date TEXT NOT NULL, -- YYYY-MM-DD
  line TEXT NOT NULL CHECK (line IN ('auto', 'fire', 'life', 'disability')),
  quotes INTEGER NOT NULL DEFAULT 0,
  apps_submitted INTEGER NOT NULL DEFAULT 0,
  premium_total REAL NOT NULL DEFAULT 0,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  UNIQUE(user_id, activity_date, line)
);

CREATE INDEX idx_daily_activity_date ON daily_activity(activity_date);
CREATE INDEX idx_daily_activity_user ON daily_activity(user_id);

-- ============================================
-- SYSTEM: Holidays
-- ============================================

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  holiday_date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  year INTEGER NOT NULL
);

-- Seed default holidays for 2026
INSERT OR IGNORE INTO holidays (name, holiday_date, year) VALUES
  ('New Year''s Day', '2026-01-01', 2026),
  ('Memorial Day', '2026-05-25', 2026),
  ('Independence Day', '2026-07-04', 2026),  -- July 4th (Saturday, observed Friday)
  ('Labor Day', '2026-09-07', 2026),
  ('Thanksgiving', '2026-11-26', 2026),
  ('Day After Thanksgiving', '2026-11-27', 2026),
  ('Christmas Day', '2026-12-25', 2026);

-- ============================================
-- AUDIT: Request & Mutation Logging
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
