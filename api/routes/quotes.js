import { Hono } from 'hono';
import { validate, logQuotesSchema } from '../lib/validators.js';

export const quoteRoutes = new Hono();

/**
 * POST / — Log quotes for today
 * Body: { line, count } (e.g., { line: "auto", count: 5 })
 * Updates daily_activity.quotes for current user, today's date, given line
 */
quoteRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const result = validate(logQuotesSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { line, count } = result.data;

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Upsert: insert or update existing row for this user+date+line
    await c.env.DB.prepare(`
      INSERT INTO daily_activity (user_id, activity_date, line, quotes, office_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, activity_date, line) DO UPDATE SET
        quotes = excluded.quotes
    `).bind(user.id, today, line, count, user.officeId).run();

    return c.json({ success: true, message: `Logged ${count} ${line} quotes for ${today}` }, 201);
  } catch (err) {
    console.error('Log quotes error:', err);
    return c.json({ error: 'Failed to log quotes' }, 500);
  }
});

/**
 * GET /today — Get today's quote counts per line for current user
 * Returns: { quotes: { auto: 5, fire: 2, ... } }
 */
quoteRoutes.get('/today', async (c) => {
  const user = c.get('user');

  try {
    const today = new Date().toISOString().slice(0, 10);

    const results = await c.env.DB.prepare(`
      SELECT line, quotes
      FROM daily_activity
      WHERE user_id = ? AND activity_date = ?
      ORDER BY line
    `).bind(user.id, today).all();

    const quotes = {};
    for (const row of results.results) {
      quotes[row.line] = row.quotes || 0;
    }

    return c.json({ quotes, date: today });
  } catch (err) {
    console.error('Get today quotes error:', err);
    return c.json({ error: 'Failed to fetch quotes' }, 500);
  }
});

/**
 * GET /summary — Get quote summary for date range
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, userId=N (leaders only)
 * Returns: { summary: [{ line, total_quotes, days_logged, avg_per_day }, ...] }
 */
quoteRoutes.get('/summary', async (c) => {
  const user = c.get('user');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const userId = c.req.query('userId');

  if (!from || !to) {
    return c.json({ error: 'from and to date range required' }, 400);
  }

  try {
    // Agents see only their own; leaders can see team member data
    let targetUserId = user.id;
    if (user.role !== 'agent' && userId) {
      targetUserId = parseInt(userId);
    }

    const results = await c.env.DB.prepare(`
      SELECT line,
             SUM(quotes) as total_quotes,
             COUNT(DISTINCT activity_date) as days_logged
      FROM daily_activity
      WHERE user_id = ? AND activity_date >= ? AND activity_date <= ?
      GROUP BY line
      ORDER BY line
    `).bind(targetUserId, from, to).all();

    const summary = results.results.map(row => ({
      line: row.line,
      total_quotes: row.total_quotes || 0,
      days_logged: row.days_logged || 0,
      avg_per_day: row.days_logged > 0 ? Math.round((row.total_quotes || 0) / row.days_logged) : 0,
    }));

    return c.json({ summary, from, to });
  } catch (err) {
    console.error('Get quote summary error:', err);
    return c.json({ error: 'Failed to fetch quote summary' }, 500);
  }
});
