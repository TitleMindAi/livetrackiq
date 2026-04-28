import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { appRoutes } from './routes/applications.js';
import { goalRoutes } from './routes/goals.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { userRoutes } from './routes/users.js';
import { quoteRoutes } from './routes/quotes.js';
import { activityRoutes } from './routes/activities.js';
import { bonusRoutes } from './routes/bonus.js';
import { holidayRoutes } from './routes/holidays.js';
import { authMiddleware } from './middleware/auth.js';
import { logger } from './middleware/logger.js';

const api = new Hono();

// CORS for local dev
api.use('/api/*', cors({
  origin: ['http://localhost:5173', 'https://livetrackiq.com'],
  credentials: true,
}));

// Request logging for all routes
api.use('*', logger);

// Public routes
api.route('/api/auth', authRoutes);

// Health check
api.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Protected routes — require valid session
api.use('/api/*', authMiddleware);
api.route('/api/apps', appRoutes);
api.route('/api/goals', goalRoutes);
api.route('/api/dashboard', dashboardRoutes);
api.route('/api/users', userRoutes);
api.route('/api/quotes', quoteRoutes);
api.route('/api/activities', activityRoutes);
api.route('/api/bonus', bonusRoutes);
api.route('/api/holidays', holidayRoutes);

// DB init endpoint (run once to create tables)
api.post('/api/admin/init-db', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const schema = `-- Schema will be applied via wrangler d1 execute`;
  return c.json({ message: 'Use wrangler d1 execute to apply schema.sql' });
});

// SPA fallback — let the asset binding handle static files,
// and for any non-API route that doesn't match a file, serve index.html
api.get('*', async (c) => {
  // This only fires if the assets binding didn't match a file
  return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
});

export default api;
