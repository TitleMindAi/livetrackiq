import { Hono } from 'hono';

export const dashboardRoutes = new Hono();

/**
 * GET / — Main dashboard data
 * Returns aggregated stats for the current user (or team if leader/admin)
 * Query: ?view=today|week|month&userId=1
 */
dashboardRoutes.get('/', async (c) => {
  const user = c.get('user');
  const view = c.req.query('view') || 'today';
  const userIds = c.req.query('userIds');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let from, to;

  switch (view) {
    case 'today':
      from = today;
      to = today;
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = y.toISOString().slice(0, 10);
      to = from;
      break;
    }
    case 'week': {
      const d = new Date(now);
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday
      from = d.toISOString().slice(0, 10);
      to = today;
      break;
    }
    case 'last_week': {
      const d = new Date(now);
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
      from = d.toISOString().slice(0, 10);
      const end = new Date(d);
      end.setDate(end.getDate() + 4); // Friday
      to = end.toISOString().slice(0, 10);
      break;
    }
    case 'month':
      from = today.slice(0, 8) + '01';
      to = today;
      break;
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = d.toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      to = end.toISOString().slice(0, 10);
      break;
    }
    case 'year':
      from = `${now.getFullYear()}-01-01`;
      to = today;
      break;
    default:
      from = today;
      to = today;
  }

  const isLeader = ['admin', 'team_leader'].includes(user.role);
  // Parse userIds (comma-separated) or single userId for backward compat
  let targetUserIds = null;
  if (userIds) {
    targetUserIds = userIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  }
  const targetUserId = user.role === 'agent' ? user.id : null;

  try {
    // Build filter clause for single or multiple users
    let userFilter = '';
    let userFilterParams = [];
    if (targetUserId) {
      userFilter = ' AND submitted_by = ?';
      userFilterParams = [targetUserId];
    } else if (targetUserIds && targetUserIds.length > 0) {
      userFilter = ` AND submitted_by IN (${targetUserIds.map(() => '?').join(',')})`;
      userFilterParams = targetUserIds;
    }

    // Summary by line
    let summSql = `
      SELECT line,
             COUNT(*) as total_apps,
             SUM(premium) as total_premium,
             COUNT(DISTINCT customer_id) as unique_customers
      FROM applications
      WHERE office_id = ?
        AND DATE(submitted_at) >= ?
        AND DATE(submitted_at) <= ?
        ${userFilter}
      GROUP BY line
    `;
    const summParams = [user.officeId, from, to, ...userFilterParams];

    const summary = await c.env.DB.prepare(summSql).bind(...summParams).all();

    // Leaderboard (top performers for the period)
    let lbSql = `
      SELECT u.id, u.name, u.initials, u.role,
             COUNT(a.id) as total_apps,
             SUM(a.premium) as total_premium
      FROM users u
      LEFT JOIN applications a ON a.submitted_by = u.id
        AND DATE(a.submitted_at) >= ? AND DATE(a.submitted_at) <= ?
      WHERE u.office_id = ? AND u.is_active = 1 AND u.role IN ('agent', 'sales_specialist')
    `;
    const lbParams = [from, to, user.officeId];
    if (targetUserId) {
      lbSql += ' AND u.id = ?';
      lbParams.push(targetUserId);
    } else if (targetUserIds && targetUserIds.length > 0) {
      lbSql += ` AND u.id IN (${targetUserIds.map(() => '?').join(',')})`;
      lbParams.push(...targetUserIds);
    }
    lbSql += ' GROUP BY u.id ORDER BY total_apps DESC';

    const leaderboard = await c.env.DB.prepare(lbSql)
      .bind(...lbParams).all();

    // Recent activity (last 10 entries)
    let recentSql = `
      SELECT a.id, a.line, a.product_type, a.premium, a.submitted_at,
             c.name as customer_name, u.name as agent_name, u.initials
      FROM applications a
      JOIN customers c ON a.customer_id = c.id
      JOIN users u ON a.submitted_by = u.id
      WHERE a.office_id = ?
        AND DATE(a.submitted_at) >= ?
        AND DATE(a.submitted_at) <= ?
        ${userFilter}
      ORDER BY a.submitted_at DESC LIMIT 10
    `;
    const recentParams = [user.officeId, from, to, ...userFilterParams];

    const recent = await c.env.DB.prepare(recentSql).bind(...recentParams).all();

    return c.json({
      view,
      from,
      to,
      summary: summary.results,
      leaderboard: leaderboard.results,
      recentActivity: recent.results,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return c.json({ error: 'Failed to load dashboard' }, 500);
  }
});

/**
 * GET /team — Team members list for team leader filtering
 */
dashboardRoutes.get('/team', async (c) => {
  const user = c.get('user');

  if (!['admin', 'team_leader'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const team = await c.env.DB.prepare(
    'SELECT id, name, initials, role, email FROM users WHERE office_id = ? AND is_active = 1 ORDER BY name'
  ).bind(user.officeId).all();

  return c.json({ team: team.results });
});
