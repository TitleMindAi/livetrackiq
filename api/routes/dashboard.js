import { Hono } from 'hono';

export const dashboardRoutes = new Hono();

/**
 * GET / — Main dashboard data
 * Returns aggregated stats for the current user (or team if leader/admin)
 * Query: ?view=today|week|month&userId=1
 */
// Hank Sprint 3: trackable scoreboard support
const TRACKABLES = [
  'auto_quote', 'fire_quote', 'life_presentation', 'disability_presentation',
  'submitted_app', 'google_review_completed', 'google_review_ask', 'referral_hh_quoted',
];

dashboardRoutes.get('/', async (c) => {
  const user = c.get('user');
  const view = c.req.query('view') || 'today';
  const userIds = c.req.query('userIds');
  const qFrom = c.req.query('from');
  const qTo = c.req.query('to');
  const trackable = c.req.query('trackable'); // Sprint 3: scoreboard metric
  // Hank 2026-04-28: comma-separated list for multi-select. `trackable` (single)
  // is still supported for backwards-compat. Multi takes precedence when present.
  const trackablesRaw = c.req.query('trackables');
  const trackables = trackablesRaw ? trackablesRaw.split(',').map(s => s.trim()).filter(Boolean) : null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let from, to;

  // Hank v2: custom range honored when view=custom and valid ISO dates provided
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const useCustom = view === 'custom' && isoDate.test(qFrom || '') && isoDate.test(qTo || '');
  if (useCustom) {
    from = qFrom;
    to = qTo;
  }

  if (!useCustom) switch (view) {
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

    // ===== Sprint 3: Trackable-aware leaderboard + recent activity =====
    // When `trackable` is one of the 8 ACTIVITY_TYPES, the leaderboard / recent
    // activity panels reflect activity_events instead of applications.
    // This lets Hank see leaders by "Auto Quote", "Google Review Ask", etc.
    // Hank 2026-04-28: resolve to active trackable list (multi takes precedence)
    const activeTrackables = (trackables && trackables.length > 0)
      ? trackables.filter(t => TRACKABLES.includes(t))
      : (trackable && TRACKABLES.includes(trackable) ? [trackable] : []);

    if (activeTrackables.length > 0) {
      try {
        const inList = activeTrackables.map(() => '?').join(',');
        // Trackable-scoped leaderboard (sums across all selected trackables)
        let lbT = `
          SELECT u.id, u.name, u.initials, u.role,
                 COALESCE(SUM(e.count), 0) as total_count
          FROM users u
          LEFT JOIN activity_events e
            ON e.user_id = u.id
            AND e.activity_type IN (${inList})
            AND e.activity_date >= ? AND e.activity_date <= ?
          WHERE u.office_id = ? AND u.is_active = 1 AND u.role IN ('agent', 'sales_specialist')
        `;
        const lbTParams = [...activeTrackables, from, to, user.officeId];
        if (targetUserId) { lbT += ' AND u.id = ?'; lbTParams.push(targetUserId); }
        else if (targetUserIds?.length) {
          lbT += ` AND u.id IN (${targetUserIds.map(() => '?').join(',')})`;
          lbTParams.push(...targetUserIds);
        }
        lbT += ' GROUP BY u.id ORDER BY total_count DESC';
        const lbTRes = await c.env.DB.prepare(lbT).bind(...lbTParams).all();

        // Trackable-scoped recent activity (last 12 events)
        let recT = `
          SELECT e.id, e.activity_type, e.activity_date, e.created_at,
                 e.customer_name, e.lead_source, e.lead_temperature, e.count,
                 u.name as agent_name, u.initials
          FROM activity_events e
          JOIN users u ON e.user_id = u.id
          WHERE e.office_id = ? AND e.activity_type IN (${inList})
            AND e.activity_date >= ? AND e.activity_date <= ?
        `;
        const recTParams = [user.officeId, ...activeTrackables, from, to];
        if (targetUserId) { recT += ' AND e.user_id = ?'; recTParams.push(targetUserId); }
        else if (targetUserIds?.length) {
          recT += ` AND e.user_id IN (${targetUserIds.map(() => '?').join(',')})`;
          recTParams.push(...targetUserIds);
        }
        recT += ' ORDER BY e.created_at DESC LIMIT 24';
        const recTRes = await c.env.DB.prepare(recT).bind(...recTParams).all();

        return c.json({
          view, from, to,
          trackable: activeTrackables.length === 1 ? activeTrackables[0] : null,
          trackables: activeTrackables,
          summary: summary.results,
          leaderboard: lbTRes.results.map(r => ({ ...r, total_apps: r.total_count })),
          recentActivity: recTRes.results.map(r => ({
            id: `e_${r.id}`,
            activity_type: r.activity_type,
            customer_name: r.customer_name || '—',
            agent_name: r.agent_name,
            initials: r.initials,
            submitted_at: r.created_at,
            count: r.count,
            lead_source: r.lead_source,
            lead_temperature: r.lead_temperature,
          })),
        });
      } catch (errT) {
        const m = String(errT?.message || errT);
        if (/no such table|no such column/i.test(m)) {
          // Fallback: trackable view degrades silently to legacy app-based view
          console.warn('Trackable leaderboard fallback (migration pending):', m);
        } else throw errT;
      }
    }

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
