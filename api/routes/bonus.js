import { Hono } from 'hono';

export const bonusRoutes = new Hono();

/**
 * Hank Sprint 6 — Bonus Projection Engine
 *
 * Endpoint: GET /api/bonus/projection?period=YYYY-MM&userId=
 *
 * Returns:
 *   actuals: counts/premium per category for the period to date
 *   pace:    on-pace projection assuming current daily rate continues
 *   scenarios: { whatIfDeltaCounts? } applied client-side; this endpoint provides actuals only
 *
 * NOTE: Hank promised an "office bonus structure" attachment with the actual schedule.
 * Until received, the engine returns raw production numbers + a tier-agnostic projection.
 * Bonus tier multipliers are computed client-side from a placeholder schedule (BONUS_SCHEDULE
 * in src/lib/bonus.js) which Ken can update once the PDF lands.
 *
 * If activity_events / applications missing → graceful zero-fill so page doesn't crash.
 */
bonusRoutes.get('/projection', async (c) => {
  const user = c.get('user');
  const now = new Date();
  const period = c.req.query('period') ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const userIdQ = c.req.query('userId');
  const targetUserId = userIdQ ? parseInt(userIdQ) : user.id;
  if (user.role === 'agent' && targetUserId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const monthStart = period + '-01';
  const [yy, mm] = period.split('-').map(Number);
  const monthEnd = new Date(yy, mm, 0).toISOString().slice(0, 10); // last day of month
  const todayIso = now.toISOString().slice(0, 10);
  const periodNotStarted = todayIso < monthStart;
  const dayOfMonth = periodNotStarted ? 0 :
    Math.min(now.getDate(), new Date(yy, mm, 0).getDate());
  const totalDays = new Date(yy, mm, 0).getDate();
  const remainingDays = Math.max(0, totalDays - dayOfMonth);

  // Pull applications by line for premium math
  let appsByLine = { auto: { apps: 0, premium: 0 }, fire: { apps: 0, premium: 0 }, life: { apps: 0, premium: 0 }, disability: { apps: 0, premium: 0 } };
  try {
    const rs = await c.env.DB.prepare(`
      SELECT line, COUNT(*) as apps, SUM(premium) as premium
      FROM applications
      WHERE office_id = ? AND submitted_by = ?
        AND submitted_at >= ? AND submitted_at <= ?
        AND product_type NOT LIKE '[VOIDED]%'
      GROUP BY line
    `).bind(user.officeId, targetUserId, monthStart, monthEnd + 'T23:59:59').all();
    for (const r of rs.results) appsByLine[r.line] = { apps: r.apps || 0, premium: r.premium || 0 };
  } catch (e) { /* no apps yet */ }

  // Pull line-item counters from activity_events
  let counters = {
    auto_quote: 0, fire_quote: 0, life_presentation: 0, disability_presentation: 0,
    submitted_app: 0, google_review_completed: 0, google_review_ask: 0, referral_hh_quoted: 0,
  };
  try {
    const rs = await c.env.DB.prepare(`
      SELECT activity_type, SUM(count) as total
      FROM activity_events
      WHERE office_id = ? AND user_id = ?
        AND substr(activity_date, 1, 7) = ?
      GROUP BY activity_type
    `).bind(user.officeId, targetUserId, period).all();
    for (const r of rs.results) counters[r.activity_type] = r.total || 0;
  } catch (e) { /* migration pending */ }

  // On-pace projections (linear extrapolation from current rate)
  const project = (n) => dayOfMonth > 0
    ? Math.round((n / dayOfMonth) * totalDays)
    : 0;

  const projection = {
    auto: { apps: project(appsByLine.auto.apps), premium: project(appsByLine.auto.premium) },
    fire: { apps: project(appsByLine.fire.apps), premium: project(appsByLine.fire.premium) },
    life: { apps: project(appsByLine.life.apps), premium: project(appsByLine.life.premium) },
    disability: { apps: project(appsByLine.disability.apps), premium: project(appsByLine.disability.premium) },
    googleReviewsCompleted: project(counters.google_review_completed),
    referralsQuoted: project(counters.referral_hh_quoted),
  };

  return c.json({
    period,
    daysElapsed: dayOfMonth,
    totalDays,
    remainingDays,
    actuals: {
      lines: appsByLine,
      counters,
    },
    projection,
  });
});
