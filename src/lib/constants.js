/**
 * Product line definitions — single source of truth
 * Matches Hank's exact categories from the requirements
 */
export const APP_TYPES = {
  auto: {
    label: 'Auto',
    icon: '\u{1F697}',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,.15)',
    types: ['Personal', 'Commercial', 'RV', 'ATV', 'Golf Cart', 'Travel Trailer', 'Trailer'],
  },
  fire: {
    label: 'Fire',
    icon: '\u{1F525}',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,.15)',
    types: ['Home', 'RDP', 'Renters', 'PLUP', 'BOP', 'CLUP', 'Work Comp', 'Condo', 'PAP', 'Contractor', 'Flood'],
  },
  life: {
    label: 'Life',
    icon: '\u2764\uFE0F',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,.15)',
    types: ['Term 10', 'Term 20', 'Term 30', 'Whole Life', '10 Pay', '15 Pay', '20 Pay', 'UL', 'IA', 'GIFE', 'ROP-20', 'ROP-30'],
  },
  disability: {
    label: 'Disability',
    icon: '\u{1F6E1}\uFE0F',
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,.15)',
    types: ['STDI', 'LTD'],
  },
};

export const LINES = Object.keys(APP_TYPES);

export const DEFAULT_RATIOS = {
  auto: 0.18,
  fire: 0.25,
  life: 0.15,
  disability: 0.15,
};

export const TIME_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

/**
 * Feature flags — toggle new-feature surfaces with legacy fallback
 * Source: Hank feedback 2026-04-24
 * Default ON to ship; flip false to hard-fallback to legacy UI
 */
export const FEATURE_FLAGS = {
  ff_hank_v2: true,            // Master flag for Hank 2026-04-24 revisions
  ff_log_activities: true,     // Rename Log Quotes -> Log Activities + expanded trackables
  ff_lead_sources: true,       // Expanded lead source dropdown w/ "Other"
  ff_custom_date_range: true,  // Dashboard custom From/To
  ff_all_trackables_board: true, // Sprint 3: Leaderboard/Recent Activity selector
  ff_quote_to_app: true,       // Sprint 2: Submit App button on logged quote rows
  ff_admin_lock: true,         // Sprint 4: Owner-only Admin tab (Hank)
  ff_goals_expand: true,       // Sprint 5: new trackables + custom add
  ff_bonus_tab: true,          // Sprint 6: Bonus tab (placeholder schedule)
  // Hank 2026-04-28 follow-up batch
  ff_activity_multiselect: true,    // Multi-select activity types in logger
  ff_premium_per_app:      true,    // N premium inputs when count > 1 on Submit App
  ff_open_quotes_filters:  true,    // Lead temp colors + searchable filters on Open Quotes
  ff_leaderboard_multi:    true,    // Multi-select trackables on leaderboard
  ff_recent_compact:       true,    // Aggregate Recent Activity per person
  ff_bonus_admin_edit:     true,    // Admin can edit bonus tier inputs (localStorage override)
};

/**
 * Lead Source — Hank 2026-04-24 expanded list
 * Keys are snake_case for DB; labels are display
 */
export const LEAD_SOURCES = [
  { key: 'ilp',                label: 'ILP' },
  { key: 'sf_com',             label: 'SF.com' },
  { key: 'winback',            label: 'Winback' },
  { key: 'current_client',     label: 'Current Client' },
  { key: 'google_ad_call_in',  label: 'Google Ad Call In' },
  { key: 'referral',           label: 'Referral' },
  { key: 'event_marketing',    label: 'Event Marketing' },
  { key: 'requote',            label: 'Requote' },
  { key: 'marketer_transfer',  label: 'Marketer Transfer' },
  { key: 'other',              label: 'Other' },
];

/**
 * Activity Trackables — Hank 2026-04-24 all 8 types
 * Replaces the quote-only model. No premium needed at log time.
 * Some tie to existing APP_TYPES lines (auto_quote -> auto), others are new counters.
 */
export const ACTIVITY_TYPES = [
  { key: 'auto_quote',              label: 'Auto Quote',              line: 'auto',        icon: '\u{1F697}', color: '#3b82f6' },
  { key: 'fire_quote',              label: 'Fire Quote',              line: 'fire',        icon: '\u{1F525}', color: '#f97316' },
  { key: 'life_presentation',       label: 'Life Presentation',       line: 'life',        icon: '\u2764\uFE0F', color: '#ef4444' },
  { key: 'disability_presentation', label: 'Disability Presentation', line: 'disability',  icon: '\u{1F6E1}\uFE0F', color: '#8b5cf6' },
  { key: 'submitted_app',           label: 'Submitted App',           line: null,          icon: '\u{1F4DD}', color: '#10b981' },
  { key: 'google_review_completed', label: 'Google Review Completed', line: null,          icon: '\u2B50',    color: '#eab308' },
  { key: 'google_review_ask',       label: 'Google Review Ask',       line: null,          icon: '\u{1F4E3}', color: '#a3a3a3' },
  { key: 'referral_hh_quoted',      label: 'Referral Household Quoted', line: null,        icon: '\u{1F91D}', color: '#06b6d4' },
];
