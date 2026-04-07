import { z } from 'zod';

// ===== Schemas =====

export const submitAppSchema = z.object({
  customerName: z.string().min(1, 'Customer name required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional(),
  notes: z.string().optional(),
  leadTemperature: z.enum(['hot', 'medium', 'cold']).optional(),
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
