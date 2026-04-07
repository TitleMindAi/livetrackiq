import { Hono } from 'hono';

export const authRoutes = new Hono();

/**
 * GET /api/auth/login — Redirect to Google OAuth consent screen
 */
authRoutes.get('/login', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const redirectUri = c.env.GOOGLE_REDIRECT_URI;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/**
 * GET /api/auth/callback — Google OAuth callback
 * Exchanges code for tokens, creates/finds user, creates session
 */
authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error || !code) {
    return c.redirect(`${c.env.APP_URL}/login?error=auth_failed`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: c.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return c.redirect(`${c.env.APP_URL}/login?error=token_failed`);
    }

    const tokens = await tokenRes.json();

    // Get user info from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      return c.redirect(`${c.env.APP_URL}/login?error=userinfo_failed`);
    }

    const googleUser = await userInfoRes.json();

    // Find existing user by email
    let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(googleUser.email)
      .first();

    if (!user) {
      // User not pre-registered — deny access
      // Admin must add users first via the admin panel
      return c.redirect(`${c.env.APP_URL}/login?error=not_registered`);
    }

    if (!user.is_active) {
      return c.redirect(`${c.env.APP_URL}/login?error=account_disabled`);
    }

    // Update avatar if changed
    if (googleUser.picture && googleUser.picture !== user.avatar_url) {
      await c.env.DB.prepare('UPDATE users SET avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(googleUser.picture, user.id)
        .run();
    }

    // Create session (24-hour expiry)
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, google_access_token, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionId, user.id, tokens.access_token, expiresAt).run();

    // Set session cookie and redirect to app
    const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400';
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${c.env.APP_URL}/`,
        'Set-Cookie': `ltiq_session=${sessionId}; ${cookieOpts}`,
      },
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.redirect(`${c.env.APP_URL}/login?error=server_error`);
  }
});

/**
 * GET /api/auth/me — Get current user from session
 */
authRoutes.get('/me', async (c) => {
  const sessionId = getCookie(c, 'ltiq_session');
  if (!sessionId) return c.json({ user: null });

  const result = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.initials, u.role, u.office_id, u.avatar_url,
           o.name as office_name
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN offices o ON u.office_id = o.id
    WHERE s.id = ? AND u.is_active = 1 AND s.expires_at > datetime('now')
  `).bind(sessionId).first();

  if (!result) return c.json({ user: null });

  return c.json({
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      initials: result.initials,
      role: result.role,
      officeId: result.office_id,
      officeName: result.office_name,
      avatarUrl: result.avatar_url,
    },
  });
});

/**
 * POST /api/auth/logout — Destroy session
 */
authRoutes.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'ltiq_session');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'ltiq_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    },
  });
});

function getCookie(c, name) {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}
