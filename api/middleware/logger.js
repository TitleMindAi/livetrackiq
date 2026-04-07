/**
 * Request logging middleware for Hono
 * Logs: method, path, user_id, timestamp, status, duration_ms
 * Format: structured JSON
 */
export const logger = async (c, next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const user = c.get('user');
  const userId = user?.id || null;

  // Call next middleware/route
  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;

  // Structured log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    method,
    path,
    userId,
    status,
    duration_ms: duration,
  };

  console.log(JSON.stringify(logEntry));
};
