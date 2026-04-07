/**
 * Auth middleware — validates session cookie and attaches user to context.
 *
 * Session flow:
 * 1. User authenticates via Google OAuth → /api/auth/callback
 * 2. Server creates session row in D1, sets `ltiq_session` cookie
 * 3. Every API request includes cookie → middleware looks up session + user
 * 4. Attaches user object to c.set('user', ...)
 */
export async function authMiddleware(c, next) {
  // Skip auth routes
  if (c.req.path.startsWith('/api/auth')) return next();

  const sessionId = getCookie(c, 'ltiq_session');
  if (!sessionId) {
    return c.json({ error: 'Not authenticated', code: 'NO_SESSION' }, 401);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT s.id as session_id, s.expires_at,
             u.id, u.email, u.name, u.initials, u.role, u.office_id, u.avatar_url, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND u.is_active = 1
    `).bind(sessionId).first();

    if (!result) {
      return c.json({ error: 'Invalid session', code: 'INVALID_SESSION' }, 401);
    }

    // Check expiry
    const now = new Date();
    const expiresAt = new Date(result.expires_at);
    if (expiresAt < now) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
      return c.json({ error: 'Session expired', code: 'EXPIRED' }, 401);
    }

    // Auto-extend session if within 4 hours of expiry (sliding window)
    const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 4) {
      const newExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
        .bind(newExpiresAt, sessionId)
        .run();
    }

    c.set('user', {
      id: result.id,
      email: result.email,
      name: result.name,
      initials: result.initials,
      role: result.role,
      officeId: result.office_id,
      avatarUrl: result.avatar_url,
    });

    await next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return c.json({ error: 'Auth error' }, 500);
  }
}

function getCookie(c, name) {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}
