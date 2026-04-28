import { Hono } from 'hono';
import { validate, addHolidaySchema } from '../lib/validators.js';

export const holidayRoutes = new Hono();

/**
 * GET / — List holidays, optionally filtered by year
 * Query: ?year=2026
 */
holidayRoutes.get('/', async (c) => {
  const user = c.get('user');
  const yearParam = c.req.query('year');

  // Schema: holidays(id, name, holiday_date, year). Aliased to `date` for client compat.
  // Office filter is graceful — schema has no office_id (holidays are global per office).
  let sql = 'SELECT id, name, holiday_date AS date, year FROM holidays';
  const params = [];

  if (yearParam) {
    sql += ' WHERE year = ?';
    params.push(parseInt(yearParam));
  }

  sql += ' ORDER BY holiday_date';

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ holidays: result.results });
});

/**
 * POST / — Add a holiday (admin only)
 * Body: { name, date (YYYY-MM-DD) }
 */
holidayRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();

  const result = validate(addHolidaySchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { name, date } = result.data;

  try {
    // Derive year from YYYY-MM-DD; schema has no office_id column.
    const year = parseInt((date || '').slice(0, 4), 10);
    const result = await c.env.DB.prepare(
      'INSERT INTO holidays (name, holiday_date, year) VALUES (?, ?, ?) RETURNING id'
    ).bind(name, date, year).first();

    return c.json({ id: result.id, message: 'Holiday added' }, 201);
  } catch (err) {
    console.error('Holiday add error:', err);
    throw err;
  }
});

/**
 * DELETE /:id — Remove a holiday (admin only)
 */
holidayRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const id = parseInt(c.req.param('id'));

  // Schema has no office_id; holidays are global. Owner-only enforced above.
  await c.env.DB.prepare('DELETE FROM holidays WHERE id = ?').bind(id).run();

  return c.json({ ok: true });
});
