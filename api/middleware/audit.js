/**
 * Audit logging helper
 * Call this after successful mutations (POST, PUT, DELETE) to record audit trail
 */
export const logAudit = async (db, { userId, action, entityType, entityId, details = {} }) => {
  try {
    const detailsJson = typeof details === 'string' ? details : JSON.stringify(details);
    await db.prepare(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(userId, action, entityType || null, entityId || null, detailsJson).run();
  } catch (err) {
    // Log but don't fail the request if audit fails
    console.error('Audit logging error:', err);
  }
};
