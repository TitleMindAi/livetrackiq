import { z } from 'zod';

// ===== Schemas =====

export const submitAppSchema = z.object({
  customerName: z.string().min(1, 'Customer name required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional(),
  notes: z.string().optional(),
  leadTemperature: z.enum(['hot', 'medium', 'cold']).optional(),
  leadSource: z.string().max(64).optional(), // Hank v2: free-form after enum + other
  lines: z.array(
    z.object({
      line: z.enum(['auto', 'fire', 'life', 'disability']),
      productType: z.string().min(1, 'Product type required'),
      premium: z.number().min(0, 'Premium must be >= 0'),
    })
  ).min(1, 'At least one line required'),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name required'),
  role: z.enum(['agent', 'team_leader', 'sales_specialist', 'admin']).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name required').optional(),
  role: z.enum(['agent', 'team_leader', 'sales_specialist', 'admin']).optional(),
  is_active: z.number().refine(v => v === 0 || v === 1, 'is_active must be 0 or 1').optional(),
  initials: z.string().optional(),
});

export const setGoalsSchema = z.object({
  userId: z.number().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
  goals: z.array(
    z.object({
      line: z.enum(['auto', 'fire', 'life', 'disability']),
      appGoal: z.number().min(0, 'appGoal must be >= 0'),
      premiumGoal: z.number().min(0, 'premiumGoal must be >= 0'),
    })
  ).min(1, 'At least one goal required'),
});

export const setRatiosSchema = z.object({
  userId: z.number().optional(),
  ratios: z.record(
    z.enum(['auto', 'fire', 'life', 'disability']),
    z.number().min(0).max(1, 'Ratio must be between 0 and 1')
  ),
});

export const logQuotesSchema = z.object({
  line: z.enum(['auto', 'fire', 'life', 'disability']),
  count: z.number().int('Count must be an integer').min(1, 'Count must be >= 1'),
});

// Hank Sprint 5: custom goal CRUD (covers new trackables + free-form goals)
export const customGoalSchema = z.object({
  userId: z.number().optional(),                    // null/undefined = office-wide
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  trackerKey: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  countGoal: z.number().int().min(0).default(0),
  premiumGoal: z.number().min(0).default(0),
  closingRatio: z.number().min(0).max(1).default(0),
});

// Hank v2 Sprint 2: convert a logged quote activity into a submitted app
// Hank 2026-04-28: support N premiums when source quote count > 1.
//   - `premium` (legacy single) still accepted for backward-compat
//   - `premiums` array (new) creates N apps from the same source activity
export const submitFromActivitySchema = z.object({
  premium: z.number().min(0, 'Premium must be >= 0').optional(),
  premiums: z.array(z.number().min(0)).optional(),
  productType: z.string().min(1, 'Product type required').max(80),
  // Optional override of customer name if not stored on the activity
  customerName: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
}).refine(
  v => typeof v.premium === 'number' || (Array.isArray(v.premiums) && v.premiums.length > 0),
  { message: 'Either premium or premiums[] is required' }
);

// Hank v2: log activity event — one of 8 trackable types
export const ACTIVITY_TYPES_ENUM = [
  'auto_quote', 'fire_quote', 'life_presentation', 'disability_presentation',
  'submitted_app', 'google_review_completed', 'google_review_ask', 'referral_hh_quoted',
];
export const logActivitySchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES_ENUM),
  count: z.number().int().min(1).default(1),
  customerName: z.string().max(200).optional(),
  leadSource: z.string().max(64).optional(),
  leadTemperature: z.enum(['hot', 'medium', 'cold']).optional(),
  notes: z.string().max(500).optional(),
});

export const addHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// ===== Validation Helper =====

/**
 * Parse and validate data against a Zod schema.
 * Returns { success: true, data } on success
 * Returns { success: false, errors: [{ field, message }, ...] } on failure
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Convert Zod errors to user-friendly format
  const errors = result.error.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));

  return { success: false, errors };
}
