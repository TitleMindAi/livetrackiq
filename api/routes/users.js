import { Hono } from 'hono';
import { logAudit } from '../middleware/audit.js';
import { validate, createUserSchema, updateUserSchema } from '../lib/validators.js';

export const userRoutes = new Hono();

/**
 * GET / — List users (admin/team_leader only)
 */
userRoutes.get('/', async (c) => {
  const user = c.get('user');

  if (!['admin', 'team_leader'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const users = await c.env.DB.prepare(
    'SELECT id, email, name, initials, role, is_active, created_at FROM users WHERE office_id = ? ORDER BY name'
  ).bind(user.officeId).all();

  return c.json({ users: users.results });
});

/**
 * POST / — Create a new user (admin only)
 * Body: { email, name, role, initials? }
 */
userRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();

  const result = validate(createUserSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const { email, name, role, initials: bodyInitials } = result.data;

  // Generate initials if not provided
  const init = bodyInitials || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO users (email, name, initials, role, office_id) VALUES (?, ?, ?, ?, ?) RETURNING id'
    ).bind(email, name, init, role || 'agent', user.officeId).first();

    // Audit log the user creation
    await logAudit(c.env.DB, {
      userId: user.id,
      action: 'create_user',
      entityType: 'user',
      entityId: result.id,
      details: { email, name, role: role || 'agent' },
    });

    return c.json({ id: result.id, message: 'User created' }, 201);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Email already registered' }, 409);
    }
    throw err;
  }
});

/**
 * PUT /:id — Update a user (admin or self for limited fields)
 */
userRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const targetId = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const result = validate(updateUserSchema, body);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const validatedBody = result.data;

  // Agents can only update themselves (limited fields)
  if (user.role !== 'admin' && user.id !== targetId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const updates = [];
  const params = [];

  if (user.role === 'admin') {
    if (validatedBody.name !== undefined) { updates.push('name = ?'); params.push(validatedBody.name); }
    if (validatedBody.role !== undefined) { updates.push('role = ?'); params.push(validatedBody.role); }
    if (validatedBody.is_active !== undefined) { updates.push('is_active = ?'); params.push(validatedBody.is_active); }
    if (validatedBody.initials !== undefined) { updates.push('initials = ?'); params.push(validatedBody.initials); }
  }

  if (validatedBody.name !== undefined && user.id === targetId) {
    if (!updates.some(u => u.startsWith('name'))) {
      updates.push('name = ?');
      params.push(validatedBody.name);
    }
  }

  if (updates.length === 0) return c.json({ error: 'No valid fields to update' }, 400);

  updates.push("updated_at = datetime('now')");
  params.push(targetId);

  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  // Audit log the user update
  await logAudit(c.env.DB, {
    userId: user.id,
    action: 'update_user',
    entityType: 'user',
    entityId: targetId,
    details: validatedBody,
  });

  return c.json({ ok: true });
});
