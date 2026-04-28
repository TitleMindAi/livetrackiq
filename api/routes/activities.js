import { Hono } from 'hono';
import { validate, logActivitySchema, submitFromActivitySchema, ACTIVITY_TYPES_ENUM } from '../lib/validators.js';
import { logAudit } from '../middleware/audit.js';

export const activityRoutes = new Hono();

// Quote-style activity types that are eligible for conversion to a Submitted App
const QUOTE_ACTIVITY_TYPES = ['auto_quote', 'fire_quote', 'life_presentation', 'disability_presentation'];
const ACTIVITY_TYPE_TO_LINE = {
  auto_quote: 'auto',
  fire_quote: 'fire',
  life_presentation: 'life',
  disability_presentation: 'disability',
};

/**
 * Hank v2 — Activity Events API
 * Decoupled from the quote-only model in daily_activity.
 * Persists to activity_events (see migrations/001_activity_events.sql).
 *
 * Fallback: if activity_events is not present (migration not run), the POST
 * returns a 503 so the client can fall back to legacy quote logging.
 */

// POST / — log a single activity event (can be aggregated count)
activityRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = validate(logActivitySchema, body);
  if (!result.success) return c.json({ error: 'Validation failed', details: result.errors }, 400);

  const { activityType, count, customerName, leadSource, leadTemperature, notes } = result.data;
  const today = new Date().toISOString().slice(0, 10);

  try {
    await c.env.DB.prepare(`
      INSERT INTO activity_events
        (user_id, office_id, activity_date, activity_type, count, customer_name, lead_source, lead_temperature, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.id, user.officeId, today, activityType, count,
      customerName || null, leadSource || null, leadTemperature || null, notes || null
    ).run();

    return c.json({ success: true, activityType, count, date: today }, 201);
  } catch (err) {
    console.error('Log activity error:', err);
    // Detect missing-table (pre-migration) -> 503 for graceful fallback
    const msg = String(err?.message || err);
    if (/no such table/i.test(msg)) {
      return c.json({ error: 'activity_events not migrated', code: 'MIGRATION_REQUIRED' }, 503);
    }
    return c.json({ error: 'Failed to log activity' }, 500);
  }
});

// GET /today — totals per activity_type for current user, today
activityRoutes.get('/today', async (c) => {
  const user = c.get('user');
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rs = await c.env.DB.prepare(`
      SELECT activity_type, SUM(count) as total
      FROM activity_events
      WHERE user_id = ? AND activity_date = ?
      GROUP BY activity_type
    `).bind(user.id, today).all();
    const totals = Object.fromEntries(ACTIVITY_TYPES_ENUM.map(t => [t, 0]));
    for (const r of rs.results) totals[r.activity_type] = r.total || 0;
    return c.json({ totals, date: today });
  } catch (err) {
    const msg = String(err?.message || err);
    if (/no such table/i.test(msg)) {
      // Graceful empty-state until migration is applied
      const totals = Object.fromEntries(ACTIVITY_TYPES_ENUM.map(t => [t, 0]));
      return c.json({ totals, date: today, migrationPending: true });
    }
    console.error('Get today activities error:', err);
    return c.json({ error: 'Failed to fetch activities' }, 500);
  }
});

// GET /open-quotes — unconverted quote/presentation activities (Hank Sprint 2)
// Used by the dashboard "Open Quotes" panel to surface a Submit App button per row
activityRoutes.get('/open-quotes', async (c) => {
  const user = c.get('user');
  const days = parseInt(c.req.query('days') || '14');
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const placeholders = QUOTE_ACTIVITY_TYPES.map(() => '?').join(',');
  const params = [user.officeId, cutoff, ...QUOTE_ACTIVITY_TYPES];
  let sql = `
    SELECT e.id, e.activity_type, e.activity_date, e.customer_name,
           e.lead_source, e.lead_temperature, e.notes, e.count,
           u.name as agent_name, u.id as agent_id
    FROM activity_events e
    JOIN users u ON e.user_id = u.id
    WHERE e.office_id = ?
      AND e.activity_date >= ?
      AND e.activity_type IN (${placeholders})
      AND e.converted_app_id IS NULL
  `;
  if (user.role === 'agent') {
    sql += ' AND e.user_id = ?';
    params.push(user.id);
  }
  sql += ' ORDER BY e.activity_date DESC, e.id DESC LIMIT 100';

  try {
    const rs = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ openQuotes: rs.results, days });
  } catch (err) {
    const msg = String(err?.message || err);
    if (/no such column|no such table/i.test(msg)) {
      return c.json({ openQuotes: [], migrationPending: true, days });
    }
    console.error('Open quotes error:', err);
    return c.json({ error: 'Failed to fetch open quotes' }, 500);
  }
});

// POST /:id/submit-app — convert an open quote into a submitted app (premium captured here)
activityRoutes.post('/:id/submit-app', async (c) => {
  const user = c.get('user');
  const activityId = parseInt(c.req.param('id'));
  if (!activityId) return c.json({ error: 'Invalid activity id' }, 400);

  const body = await c.req.json();
  const v = validate(submitFromActivitySchema, body);
  if (!v.success) return c.json({ error: 'Validation failed', details: v.errors }, 400);
  const { premium, premiums, productType, customerName, notes } = v.data;
  // Hank 2026-04-28: normalize to array. premiums[] takes precedence; legacy `premium` still works.
  const premiumList = Array.isArray(premiums) && premiums.length > 0
    ? premiums
    : [typeof premium === 'number' ? premium : 0];

  try {
    // Fetch activity (and verify it's an open quote in caller's scope)
    const activity = await c.env.DB.prepare(
      `SELECT * FROM activity_events WHERE id = ? AND office_id = ?`
    ).bind(activityId, user.officeId).first();

    if (!activity) return c.json({ error: 'Activity not found' }, 404);
    if (activity.converted_app_id) return c.json({ error: 'Activity already converted' }, 409);
    if (!QUOTE_ACTIVITY_TYPES.includes(activity.activity_type)) {
      return c.json({ error: 'Only quote/presentation activities can be converted' }, 400);
    }
    if (user.role === 'agent' && activity.user_id !== user.id) {
      return c.json({ error: 'Only the logging agent can convert this quote' }, 403);
    }

    const line = ACTIVITY_TYPE_TO_LINE[activity.activity_type];
    const resolvedName = (customerName?.trim() || activity.customer_name || 'Unknown').slice(0, 200);
    // P0: pull lead_source from the originating activity_event (preserves source through conversion)
    const leadSource = activity.lead_source || null;

    // Find or create customer
    let customer = await c.env.DB.prepare(
      'SELECT id FROM customers WHERE office_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(user.officeId, resolvedName).first();
    if (!customer) {
      try {
        customer = await c.env.DB.prepare(
          'INSERT INTO customers (name, notes, lead_source, office_id, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id'
        ).bind(resolvedName, notes || null, leadSource, user.officeId, user.id).first();
      } catch (e) {
        if (/no such column/i.test(String(e?.message || e))) {
          customer = await c.env.DB.prepare(
            'INSERT INTO customers (name, notes, office_id, created_by) VALUES (?, ?, ?, ?) RETURNING id'
          ).bind(resolvedName, notes || null, user.officeId, user.id).first();
        } else throw e;
      }
    }

    // Insert N applications (Hank 2026-04-28: source quote count may be > 1)
    // Backwards-compat: if only `premium` is supplied, premiumList is [premium]
    const appIds = [];
    let totalPremium = 0;
    for (const p of premiumList) {
      const safe = Number.isFinite(p) ? p : 0;
      totalPremium += safe;
      let appRow;
      try {
        appRow = await c.env.DB.prepare(
          `INSERT INTO applications (customer_id, line, product_type, premium, submitted_by, office_id, lead_source)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
        ).bind(customer.id, line, productType, safe, user.id, user.officeId, leadSource).first();
      } catch (e) {
        if (/no such column/i.test(String(e?.message || e))) {
          appRow = await c.env.DB.prepare(
            `INSERT INTO applications (customer_id, line, product_type, premium, submitted_by, office_id)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
          ).bind(customer.id, line, productType, safe, user.id, user.officeId).first();
        } else throw e;
      }
      appIds.push(appRow.id);
    }
    const firstAppId = appIds[0];

    // P0 Fix #2: emit submitted_app activity_event(s) so trackable scoreboard updates
    try {
      await c.env.DB.prepare(`
        INSERT INTO activity_events
          (user_id, office_id, activity_date, activity_type, count, customer_name, lead_source)
        VALUES (?, ?, date('now'), 'submitted_app', ?, ?, ?)
      `).bind(user.id, user.officeId, premiumList.length, resolvedName, leadSource).run();
    } catch (e) { /* migration pending — silent */ }

    // Mark activity as converted (link to first app — schema is single-FK)
    await c.env.DB.prepare(
      `UPDATE activity_events SET converted_app_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(firstAppId, activityId).run();

    // Update daily_activity rollup so legacy queries stay consistent
    const today = new Date().toISOString().slice(0, 10);
    await c.env.DB.prepare(`
      INSERT INTO daily_activity (user_id, activity_date, line, quotes, apps_submitted, premium_total, office_id)
      VALUES (?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(user_id, activity_date, line) DO UPDATE SET
        apps_submitted = apps_submitted + excluded.apps_submitted,
        premium_total = premium_total + excluded.premium_total
    `).bind(user.id, today, line, premiumList.length, totalPremium, user.officeId).run();

    // Audit
    try {
      await logAudit(c.env.DB, {
        userId: user.id,
        action: 'convert_quote_to_app',
        entityType: 'activity_event',
        entityId: activityId,
        details: { applicationIds: appIds, line, productType, premiums: premiumList, totalPremium },
      });
    } catch (e) { /* non-blocking */ }

    return c.json({
      success: true,
      activityId,
      applicationId: firstAppId,
      applicationIds: appIds,
      customerId: customer.id,
      line,
      premium: totalPremium,
      premiums: premiumList,
    }, 201);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/no such column|no such table/i.test(msg)) {
      return c.json({ error: 'Migration 002 required', code: 'MIGRATION_REQUIRED' }, 503);
    }
    console.error('Submit-from-activity error:', err);
    return c.json({ error: 'Failed to convert quote to app' }, 500);
  }
});

// GET /summary — date-range, optional userId + type filter
activityRoutes.get('/summary', async (c) => {
  const user = c.get('user');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const userId = c.req.query('userId');
  const activityType = c.req.query('activityType');
  if (!from || !to) return c.json({ error: 'from and to required' }, 400);

  const targetUserId = user.role !== 'agent' && userId ? parseInt(userId) : user.id;
  const params = [user.officeId, from, to];
  let sql = `
    SELECT activity_type, SUM(count) as total
    FROM activity_events
    WHERE office_id = ? AND activity_date >= ? AND activity_date <= ?
  `;
  if (targetUserId) { sql += ' AND user_id = ?'; params.push(targetUserId); }
  if (activityType) { sql += ' AND activity_type = ?'; params.push(activityType); }
  sql += ' GROUP BY activity_type ORDER BY activity_type';

  try {
    const rs = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ from, to, summary: rs.results });
  } catch (err) {
    const msg = String(err?.message || err);
    if (/no such table/i.test(msg)) return c.json({ from, to, summary: [], migrationPending: true });
    console.error('Activity summary error:', err);
    return c.json({ error: 'Failed to fetch summary' }, 500);
  }
});
