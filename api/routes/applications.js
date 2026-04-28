import { Hono } from 'hono';
import { logAudit } from '../middleware/audit.js';
import { validate, submitAppSchema } from '../lib/validators.js';

export const appRoutes = new Hono();

/**
 * POST / — Submit a new application (customer-name-first flow)
 * Body: { customerName, phone?, email?, notes?, lines: [{ line, productType, premium }] }
 */
appRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const result = validate(submitAppSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { customerName, phone, email, notes, lines, leadTemperature, leadSource } = result.data;

  try {
    // Create customer record (P0: persist lead_source — graceful fallback if migration 005 not run)
    let customerId;
    try {
      const custResult = await c.env.DB.prepare(
        'INSERT INTO customers (name, phone, email, notes, lead_source, office_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
      ).bind(customerName, phone || null, email || null, notes || null, leadSource || null, user.officeId, user.id).first();
      customerId = custResult.id;
    } catch (e) {
      if (/no such column/i.test(String(e?.message || e))) {
        const custResult = await c.env.DB.prepare(
          'INSERT INTO customers (name, phone, email, notes, office_id, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
        ).bind(customerName, phone || null, email || null, notes || null, user.officeId, user.id).first();
        customerId = custResult.id;
      } else throw e;
    }

    // Insert each application line (P0: persist lead_source per row, with fallback)
    let insertStmt;
    try {
      insertStmt = c.env.DB.prepare(
        'INSERT INTO applications (customer_id, line, product_type, premium, submitted_by, office_id, lead_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const batch = lines.map(l =>
        insertStmt.bind(customerId, l.line, l.productType, l.premium || 0, user.id, user.officeId, leadSource || null)
      );
      await c.env.DB.batch(batch);
    } catch (e) {
      if (/no such column/i.test(String(e?.message || e))) {
        const legacyStmt = c.env.DB.prepare(
          'INSERT INTO applications (customer_id, line, product_type, premium, submitted_by, office_id) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const batch = lines.map(l =>
          legacyStmt.bind(customerId, l.line, l.productType, l.premium || 0, user.id, user.officeId)
        );
        await c.env.DB.batch(batch);
      } else throw e;
    }

    // P0 Fix #2: emit a submitted_app activity_event so the Sprint 3 scoreboard
    // for "Submitted App" trackable reflects this submission. Best-effort — if
    // the migration isn't run yet the catch silently no-ops.
    try {
      await c.env.DB.prepare(`
        INSERT INTO activity_events
          (user_id, office_id, activity_date, activity_type, count, customer_name, lead_source)
        VALUES (?, ?, date('now'), 'submitted_app', ?, ?, ?)
      `).bind(user.id, user.officeId, lines.length, customerName, leadSource || null).run();
    } catch (e) { /* migration 001 pending — fall back silently */ }

    // Create lead with temperature (auto-closed since app is being submitted)
    if (leadTemperature) {
      await c.env.DB.prepare(
        `INSERT INTO leads (customer_id, temperature, assigned_to, notes, is_closed, closed_at, office_id, created_by)
         VALUES (?, ?, ?, ?, 1, datetime('now'), ?, ?)`
      ).bind(customerId, leadTemperature, user.id, null, user.officeId, user.id).run();
    }

    // Audit log the submission
    await logAudit(c.env.DB, {
      userId: user.id,
      action: 'submit_app',
      entityType: 'customer',
      entityId: customerId,
      details: { linesSubmitted: lines.length, customerName, leadTemperature: leadTemperature || 'none' },
    });

    // Auto-close any other open leads for this customer
    await c.env.DB.prepare(
      'UPDATE leads SET is_closed = 1, closed_at = datetime(\'now\') WHERE customer_id = ? AND is_closed = 0'
    ).bind(customerId).run();

    // Update daily_activity rollup
    const today = new Date().toISOString().slice(0, 10);
    for (const l of lines) {
      await c.env.DB.prepare(`
        INSERT INTO daily_activity (user_id, activity_date, line, quotes, apps_submitted, premium_total, office_id)
        VALUES (?, ?, ?, 0, 1, ?, ?)
        ON CONFLICT(user_id, activity_date, line) DO UPDATE SET
          apps_submitted = apps_submitted + 1,
          premium_total = premium_total + excluded.premium_total
      `).bind(user.id, today, l.line, l.premium || 0, user.officeId).run();
    }

    return c.json({
      customerId,
      linesSubmitted: lines.length,
      message: 'Application submitted successfully',
    }, 201);
  } catch (err) {
    console.error('Submit application error:', err);
    return c.json({ error: 'Failed to submit application' }, 500);
  }
});

/**
 * GET / — List recent applications with filters
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&line=auto&userId=1&include_voided=false
 */
appRoutes.get('/', async (c) => {
  const user = c.get('user');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const line = c.req.query('line');
  const userId = c.req.query('userId');
  const includeVoided = c.req.query('include_voided') === 'true';
  const limit = parseInt(c.req.query('limit') || '50');

  let sql = `
    SELECT a.id, a.line, a.product_type, a.premium, a.submitted_at,
           c.name as customer_name, c.phone as customer_phone,
           u.name as submitted_by_name, u.initials as submitted_by_initials
    FROM applications a
    JOIN customers c ON a.customer_id = c.id
    JOIN users u ON a.submitted_by = u.id
    WHERE a.office_id = ?
  `;
  const params = [user.officeId];

  // Filter out voided apps by default
  if (!includeVoided) {
    sql += ' AND a.product_type NOT LIKE ?';
    params.push('[VOIDED]%');
  }

  // Team leaders / admins see all; agents see only their own
  if (user.role === 'agent') {
    sql += ' AND a.submitted_by = ?';
    params.push(user.id);
  } else if (userId) {
    sql += ' AND a.submitted_by = ?';
    params.push(parseInt(userId));
  }

  if (from) { sql += ' AND a.submitted_at >= ?'; params.push(from); }
  if (to) { sql += ' AND a.submitted_at <= ?'; params.push(to + 'T23:59:59'); }
  if (line) { sql += ' AND a.line = ?'; params.push(line); }

  sql += ' ORDER BY a.submitted_at DESC LIMIT ?';
  params.push(limit);

  const stmt = c.env.DB.prepare(sql);
  const results = await stmt.bind(...params).all();

  return c.json({ applications: results.results });
});

/**
 * PUT /:id — Edit an application
 * Body: { productType, premium }
 * Only submitter or admin/team_leader can edit. Must be within 24 hours of submission.
 */
appRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const appId = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { productType, premium } = body;

  if (!productType && premium === undefined) {
    return c.json({ error: 'At least one field (productType, premium) required' }, 400);
  }

  try {
    // Fetch the application
    const app = await c.env.DB.prepare(
      'SELECT a.*, c.office_id FROM applications a JOIN customers c ON a.customer_id = c.id WHERE a.id = ?'
    ).bind(appId).first();

    if (!app) {
      return c.json({ error: 'Application not found' }, 404);
    }

    // Check permission: submitter, team_leader, or admin
    if (user.role === 'agent' && app.submitted_by !== user.id) {
      return c.json({ error: 'Only the submitter can edit' }, 403);
    }

    // Check 24-hour window
    const submittedTime = new Date(app.submitted_at).getTime();
    const now = Date.now();
    const hoursDiff = (now - submittedTime) / (1000 * 60 * 60);
    if (hoursDiff > 24) {
      return c.json({ error: 'Cannot edit applications older than 24 hours' }, 400);
    }

    // Update
    const updates = [];
    const params = [];
    if (productType !== undefined) {
      updates.push('product_type = ?');
      params.push(productType);
    }
    if (premium !== undefined) {
      updates.push('premium = ?');
      params.push(premium);
    }
    params.push(appId);

    await c.env.DB.prepare(
      `UPDATE applications SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Audit
    await logAudit(c.env.DB, {
      userId: user.id,
      action: 'edit_app',
      entityType: 'application',
      entityId: appId,
      details: { productType, premium },
    });

    // Fetch and return updated app
    const updated = await c.env.DB.prepare(
      'SELECT * FROM applications WHERE id = ?'
    ).bind(appId).first();

    return c.json(updated);
  } catch (err) {
    console.error('Edit application error:', err);
    return c.json({ error: 'Failed to edit application' }, 500);
  }
});

/**
 * PUT /:id/void — Soft-delete / void an application
 * Only admin/team_leader can void. Sets premium to 0 and prefixes product_type with '[VOIDED]'.
 * Also updates daily_activity rollup to subtract the voided amount.
 */
appRoutes.put('/:id/void', async (c) => {
  const user = c.get('user');
  const appId = parseInt(c.req.param('id'));

  // Only admin/team_leader can void
  if (user.role === 'agent') {
    return c.json({ error: 'Only admin or team leader can void applications' }, 403);
  }

  try {
    const app = await c.env.DB.prepare(
      'SELECT * FROM applications WHERE id = ?'
    ).bind(appId).first();

    if (!app) {
      return c.json({ error: 'Application not found' }, 404);
    }

    // Skip if already voided
    if (app.product_type.startsWith('[VOIDED]')) {
      return c.json({ error: 'Application is already voided' }, 400);
    }

    // Void: set premium to 0, prefix product_type
    const voidedType = `[VOIDED] ${app.product_type}`;
    await c.env.DB.prepare(
      'UPDATE applications SET premium = 0, product_type = ? WHERE id = ?'
    ).bind(voidedType, appId).run();

    // Update daily_activity rollup: subtract the voided premium amount
    const activityDate = new Date(app.submitted_at).toISOString().slice(0, 10);
    await c.env.DB.prepare(`
      UPDATE daily_activity
      SET premium_total = premium_total - ?
      WHERE user_id = ? AND activity_date = ? AND line = ?
    `).bind(app.premium, app.submitted_by, activityDate, app.line).run();

    // Audit
    await logAudit(c.env.DB, {
      userId: user.id,
      action: 'void_app',
      entityType: 'application',
      entityId: appId,
      details: { originalType: app.product_type, originalPremium: app.premium },
    });

    // Return updated app
    const updated = await c.env.DB.prepare(
      'SELECT * FROM applications WHERE id = ?'
    ).bind(appId).first();

    return c.json(updated);
  } catch (err) {
    console.error('Void application error:', err);
    return c.json({ error: 'Failed to void application' }, 500);
  }
});

/**
 * GET /customers/search?q=John — Search customers by name
 * Returns: id, name, phone, email, created_at, app_count
 * Scoped to user's office. Limit 10, ordered by most recent first.
 */
appRoutes.get('/customers/search', async (c) => {
  const user = c.get('user');
  const q = c.req.query('q') || '';

  if (!q || q.trim().length < 2) {
    return c.json({ customers: [] });
  }

  try {
    const results = await c.env.DB.prepare(`
      SELECT
        c.id, c.name, c.phone, c.email, c.created_at,
        COUNT(a.id) as app_count
      FROM customers c
      LEFT JOIN applications a ON c.id = a.customer_id
      WHERE c.office_id = ? AND c.name LIKE ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind(user.officeId, `%${q}%`).all();

    return c.json({ customers: results.results });
  } catch (err) {
    console.error('Customer search error:', err);
    return c.json({ error: 'Failed to search customers' }, 500);
  }
});

/**
 * GET /stats — Aggregated stats for dashboard
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=1
 */
appRoutes.get('/stats', async (c) => {
  const user = c.get('user');
  const from = c.req.query('from') || new Date().toISOString().slice(0, 8) + '01'; // First of current month
  const to = c.req.query('to') || new Date().toISOString().slice(0, 10);
  const userId = c.req.query('userId');

  const targetUserId = (user.role === 'agent') ? user.id : (userId ? parseInt(userId) : null);

  let sql = `
    SELECT line,
           COUNT(*) as total_apps,
           SUM(premium) as total_premium,
           COUNT(DISTINCT customer_id) as unique_customers
    FROM applications
    WHERE office_id = ?
      AND submitted_at >= ?
      AND submitted_at <= ?
      AND product_type NOT LIKE ?
  `;
  const params = [user.officeId, from, to + 'T23:59:59', '[VOIDED]%'];

  if (targetUserId) {
    sql += ' AND submitted_by = ?';
    params.push(targetUserId);
  }

  sql += ' GROUP BY line';

  const results = await c.env.DB.prepare(sql).bind(...params).all();

  // Also get daily totals for the period
  let dailySql = `
    SELECT DATE(submitted_at) as day, line, COUNT(*) as apps, SUM(premium) as premium
    FROM applications
    WHERE office_id = ? AND submitted_at >= ? AND submitted_at <= ? AND product_type NOT LIKE ?
  `;
  const dailyParams = [user.officeId, from, to + 'T23:59:59', '[VOIDED]%'];

  if (targetUserId) {
    dailySql += ' AND submitted_by = ?';
    dailyParams.push(targetUserId);
  }

  dailySql += ' GROUP BY day, line ORDER BY day';

  const dailyResults = await c.env.DB.prepare(dailySql).bind(...dailyParams).all();

  return c.json({
    summary: results.results,
    daily: dailyResults.results,
  });
});
