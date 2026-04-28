/**
 * Hank Sprint 6 — Bonus Schedule (PLACEHOLDER)
 *
 * Hank's email referenced an attached office bonus structure that has not yet been
 * delivered. This file is a structurally-complete placeholder so the Bonus tab
 * renders correct math and what-if toggles. When Hank delivers the PDF, update
 * the tier thresholds and dollar amounts below — the rest of the UI follows.
 *
 * Each category has an array of { threshold, bonus } steps. Bonus is paid at the
 * highest tier whose threshold has been met. This mirrors typical State Farm
 * agent compensation structures.
 *
 * Line-items pay a flat amount per qualifying event up to a cap (or unlimited).
 *
 * Hank 2026-04-28: schedule can now be overridden at runtime via localStorage so
 * admins can tweak inputs without a deploy. See loadSchedule() / saveSchedule().
 */

const STORAGE_KEY = 'livetrackiq.bonusSchedule.v1';
const LINE_ITEM_KEY = 'livetrackiq.lineItemBonuses.v1';

export const DEFAULT_BONUS_SCHEDULE = {
  // Volume tiers (per-month) — UPDATE WHEN HANK SHARES PDF
  autoApplications: [
    { threshold: 25, bonus: 200 },
    { threshold: 35, bonus: 400 },
    { threshold: 50, bonus: 700 },
  ],
  autoPremium: [
    { threshold: 30000, bonus: 250 },
    { threshold: 50000, bonus: 500 },
    { threshold: 75000, bonus: 900 },
  ],
  fireApplications: [
    { threshold: 8,  bonus: 150 },
    { threshold: 12, bonus: 300 },
    { threshold: 18, bonus: 550 },
  ],
  firePremium: [
    { threshold: 10000, bonus: 200 },
    { threshold: 18000, bonus: 400 },
    { threshold: 28000, bonus: 700 },
  ],
  lifeApplications: [
    { threshold: 4,  bonus: 250 },
    { threshold: 7,  bonus: 500 },
    { threshold: 10, bonus: 900 },
  ],
  lifePremium: [
    { threshold: 200,  bonus: 200 },  // monthly premium
    { threshold: 400,  bonus: 400 },
    { threshold: 700,  bonus: 750 },
  ],
  disabilityPremium: [
    { threshold: 100, bonus: 150 },
    { threshold: 250, bonus: 350 },
    { threshold: 500, bonus: 700 },
  ],
};

// Line-item bonuses — flat $ per qualifying event
// NOTE: Submitted ≠ Issued. Until we have an issuance feed from underwriting, line items
// for auto/fire/life count *submitted apps*. Labels reflect this honestly so Hank/staff
// don't conflate. Swap to "Issued" once an issuance event type is added.
export const DEFAULT_LINE_ITEM_BONUSES = {
  autoSubmitted:           { perEvent: 5,  cap: null,  label: 'Auto App Submitted',     note: 'Issuance not tracked' },
  fireSubmitted:           { perEvent: 10, cap: null,  label: 'Fire App Submitted',     note: 'Issuance not tracked' },
  lifeSubmitted:           { perEvent: 25, cap: null,  label: 'Life App Submitted',     note: 'Issuance not tracked' },
  retirementStatement:     { perEvent: 5,  cap: null,  label: 'Retirement Statement',   note: 'Manual entry — no event yet' },
  retirementStmtAndAppt:   { perEvent: 15, cap: null,  label: 'Retirement Stmt + Appt', note: 'Manual entry — no event yet' },
  googleReviewCompleted:   { perEvent: 10, cap: null,  label: 'Google Review Completed' },
  referralQuoted:          { perEvent: 5,  cap: null,  label: 'Referral Quoted' },
};

/**
 * Load the active schedule (default + admin overrides from localStorage).
 * Falls back gracefully if storage is unavailable or contents corrupt.
 */
export function loadSchedule() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_BONUS_SCHEDULE;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BONUS_SCHEDULE;
    const parsed = JSON.parse(raw);
    // Shallow-merge: keep any keys not present in the override
    return { ...DEFAULT_BONUS_SCHEDULE, ...parsed };
  } catch {
    return DEFAULT_BONUS_SCHEDULE;
  }
}

export function saveSchedule(schedule) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
    return true;
  } catch {
    return false;
  }
}

export function loadLineItems() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_LINE_ITEM_BONUSES;
    const raw = window.localStorage.getItem(LINE_ITEM_KEY);
    if (!raw) return DEFAULT_LINE_ITEM_BONUSES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LINE_ITEM_BONUSES, ...parsed };
  } catch {
    return DEFAULT_LINE_ITEM_BONUSES;
  }
}

export function saveLineItems(items) {
  try {
    window.localStorage.setItem(LINE_ITEM_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function resetSchedule() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LINE_ITEM_KEY);
    return true;
  } catch {
    return false;
  }
}

// Live exports — read at module load. The Bonus tab also reads loadSchedule()
// directly when the editor saves, so changes propagate without a reload.
export const BONUS_SCHEDULE = loadSchedule();
export const LINE_ITEM_BONUSES = loadLineItems();

export const BONUS_CATEGORIES = [
  { key: 'autoApplications',    label: 'Auto Applications',    unit: 'apps',    fromActuals: a => a.lines.auto.apps },
  { key: 'autoPremium',         label: 'Auto Premium',         unit: '$',       fromActuals: a => a.lines.auto.premium },
  { key: 'fireApplications',    label: 'Fire Applications',    unit: 'apps',    fromActuals: a => a.lines.fire.apps },
  { key: 'firePremium',         label: 'Fire Premium',         unit: '$',       fromActuals: a => a.lines.fire.premium },
  { key: 'lifeApplications',    label: 'Life Applications',    unit: 'apps',    fromActuals: a => a.lines.life.apps },
  { key: 'lifePremium',         label: 'Life Premium',         unit: '$',       fromActuals: a => a.lines.life.premium },
  { key: 'disabilityPremium',   label: 'Disability Premium',   unit: '$',       fromActuals: a => a.lines.disability.premium },
];

/**
 * Compute current bonus from a value against a tiered schedule.
 * Returns the highest tier reached, or 0 if none.
 */
export function computeTierBonus(value, schedule) {
  let won = 0;
  let nextTier = null;
  for (const step of schedule) {
    if (value >= step.threshold) won = step.bonus;
    else if (!nextTier) nextTier = step;
  }
  return { bonus: won, nextTier };
}

/**
 * Sum bonus across all categories given an actuals snapshot.
 */
export function totalBonus(actuals) {
  let sum = 0;
  for (const cat of BONUS_CATEGORIES) {
    const v = cat.fromActuals(actuals);
    sum += computeTierBonus(v, BONUS_SCHEDULE[cat.key]).bonus;
  }
  return sum;
}
