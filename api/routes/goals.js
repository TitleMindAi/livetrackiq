import { Hono } from 'hono';
import { validate, setGoalsSchema, setRatiosSchema } from '../lib/validators.js';

export const goalRoutes = new Hono();

// Default closing ratios (Hank's numbers)
const DEFAULT_RATIOS = {
  auto: 0.18,
  fire: 0.25,
  life: 0.15,
  disability: 0.15,
};

// Hank's holidays for working day calculation
const HOLIDAY_NAMES = [
  'Christmas Day', "New Year's Day", 'Thanksgiving',
  'Day After Thanksgiving', 'Labor Day', 'Memorial Day', 'Independence Day',
];

/**
 * GET /calculator — Real-time goal calculator for a user
 * Returns: current progress, remaining goals, quotes needed per day
 * Query: ?userId=1&period=2026-04
 */
goalRoutes.get('/calculator', async (c) => {
  const user = c.get('user');
  const targetUserId = c.req.query('userId')
    ? parseInt(c.req.query('userId'))
    : user.id;
  const now = new Date();
  const period = c.req.query('period') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Only agents can view their own; leaders/admins can view anyone
  if (user.role === 'agent' && targetUserId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    // Get user's goals for this period
    const goals = await c.env.DB.prepare(
      'SELECT line, app_goal, premium_goal FROM goals WHERE user_id = ? AND period = ?'
    ).bind(targetUserId, period).all();

    // Get user's closing ratios (fall back to defaults)
    const ratios = await c.env.DB.prepare(
      'SELECT line, ratio FROM closing_ratios WHERE user_id = ?'
    ).bind(targetUserId).all();

    const ratioMap = {};
    for (const r of ratios.results) ratioMap[r.line] = r.ratio;
    for (const line of ['auto', 'fire', 'life', 'disability']) {
      if (!ratioMap[line]) ratioMap[line] = DEFAULT_RATIOS[line];
    }

    // Get current month's actuals
    const monthStart = period + '-01';
    const nextMonth = incrementMonth(period);
    const monthEnd = nextMonth + '-01';

    const actuals = await c.env.DB.prepare(`
      SELECT line, COUNT(*) as apps, SUM(premium) as premium
      FROM applications
      WHERE submitted_by = ? AND submitted_at >= ? AND submitted_at < ?
      GROUP BY line
    `).bind(targetUserId, monthStart, monthEnd).all();

    const actualMap = {};
    for (const a of actuals.results) {
      actualMap[a.line] = { apps: a.apps, premium: a.premium };
    }

    // Calculate remaining working days in the period
    const holidays = await c.env.DB.prepare(
      'SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?'
    ).bind(now.toISOString().slice(0, 10), monthEnd).all();

    const holidaySet = new Set(holidays.results.map(h => h.holiday_date));
    const remainingWorkDays = countWorkingDays(now, monthEnd, holidaySet);
    const totalWorkDays = countWorkingDaysInMonth(period, holidaySet);

    // Build calculator output per line
    const lines = {};
    for (const line of ['auto', 'fire', 'life', 'disability']) {
      const goal = goals.results.find(g => g.line === line);
      const actual = actualMap[line] || { apps: 0, premium: 0 };
      const appGoal = goal ? goal.app_goal : 0;
      const premiumGoal = goal ? goal.premium_goal : 0;
      const remaining = Math.max(0, appGoal - actual.apps);
      const closeRate = ratioMap[line];
      const quotesNeeded = closeRate > 0 ? Math.ceil(remaining / closeRate) : 0;
      const quotesPerDay = remainingWorkDays > 0 ? Math.ceil(quotesNeeded / remainingWorkDays) : quotesNeeded;

      // Auto-specific: Hank's avg 2 cars per HH calculation
      let hhNeeded = null;
      let carsFromHH = null;
      if (line === 'auto') {
        hhNeeded = closeRate > 0 ? Math.ceil(remaining / closeRate / 2) : 0; // 2 cars per HH avg
        carsFromHH = hhNeeded * 2;
      }

      const pacePercent = appGoal > 0
        ? Math.round((actual.apps / appGoal) * 100)
        : 0;

      // Expected pace based on working days elapsed
      const daysElapsed = totalWorkDays - remainingWorkDays;
      const expectedPace = totalWorkDays > 0
        ? Math.round((daysElapsed / totalWorkDays) * 100)
        : 0;

      lines[line] = {
        goal: appGoal,
        premiumGoal,
        actual: actual.apps,
        actualPremium: actual.premium || 0,
        remaining,
        closeRate,
        quotesNeeded,
        quotesPerDay,
        hhNeeded,
        carsFromHH,
        pacePercent,
        expectedPace,
        onTrack: pacePercent >= expectedPace,
      };
    }

    return c.json({
      userId: targetUserId,
      period,
      remainingWorkDays,
      totalWorkDays,
      lines,
      ratios: ratioMap,
    });
  } catch (err) {
    console.error('Goal calculator error:', err);
    return c.json({ error: 'Failed to calculate goals' }, 500);
  }
});

/**
 * PUT / — Set goals for a user/period
 * Body: { userId, period, goals: [{ line, appGoal, premiumGoal }] }
 */
goalRoutes.put('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const result = validate(setGoalsSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { userId, period, goals: goalList } = result.data;

  // Only admins/team_leaders can set goals for others
  const targetId = userId || user.id;
  if (targetId !== user.id && !['admin', 'team_leader'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const stmts = goalList.map(g =>
      c.env.DB.prepare(`
        INSERT INTO goals (user_id, line, app_goal, premium_goal, period)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, line, period) DO UPDATE SET
          app_goal = excluded.app_goal,
          premium_goal = excluded.premium_goal
      `).bind(targetId, g.line, g.appGoal || 0, g.premiumGoal || 0, period)
    );

    await c.env.DB.batch(stmts);
    return c.json({ ok: true });
  } catch (err) {
    console.error('Set goals error:', err);
    return c.json({ error: 'Failed to set goals' }, 500);
  }
});

/**
 * PUT /ratios — Set closing ratios for a user
 * Body: { userId?, ratios: { auto: 0.18, fire: 0.25, ... } }
 */
goalRoutes.put('/ratios', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const result = validate(setRatiosSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { userId, ratios } = result.data;
  const targetId = userId || user.id;

  if (targetId !== user.id && !['admin', 'team_leader'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const stmts = Object.entries(ratios).map(([line, ratio]) =>
    c.env.DB.prepare(`
      INSERT INTO closing_ratios (user_id, line, ratio) VALUES (?, ?, ?)
      ON CONFLICT(user_id, line) DO UPDATE SET ratio = excluded.ratio
    `).bind(targetId, line, ratio)
  );

  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ===== Helpers =====

function incrementMonth(period) {
  const [y, m] = period.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function countWorkingDays(fromDate, toDateStr, holidaySet) {
  let count = 0;
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  // Start from tomorrow if today is partially done
  d.setDate(d.getDate() + 1);

  const end = new Date(toDateStr);
  while (d < end) {
    const day = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function countWorkingDaysInMonth(period, holidaySet) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  let count = 0;
  const d = new Date(start);
  while (d < end) {
    const day = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}
