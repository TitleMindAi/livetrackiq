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

  let sql = 'SELECT id, name, date, CAST(strftime("%Y", date) as INTEGER) as year FROM holidays WHERE office_id = ?';
  const params = [user.officeId];

  if (yearParam) {
    sql += ' AND CAST(strftime("%Y", date) as INTEGER) = ?';
    params.push(parseInt(yearParam));
  }

  sql += ' ORDER BY date';

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
    const result = await c.env.DB.prepare(
      'INSERT INTO holidays (office_id, name, date) VALUES (?, ?, ?) RETURNING id'
    ).bind(user.officeId, name, date).first();

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

  await c.env.DB.prepare('DELETE FROM holidays WHERE id = ? AND office_id = ?')
    .bind(id, user.officeId)
    .run();

  return c.json({ ok: true });
});
