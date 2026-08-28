/**
 * Input Validation Module - Zod Schemas
 * 
 * Comprehensive validation schemas for authentication, API requests,
 * user data, and common patterns.
 */

import { z } from 'zod';

/**
 * Validation result type
 */
export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: z.ZodIssue[];
}

/**
 * Common validation error messages
 */
export const VALIDATION_ERRORS = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_URL: 'Please enter a valid URL',
  INVALID_PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, and number',
  PASSWORD_MISMATCH: 'Passwords do not match',
  TOO_SHORT: 'Value is too short',
  TOO_LONG: 'Value is too long',
  INVALID_FORMAT: 'Invalid format',
} as const;

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strong password regex (8+ chars, uppercase, lowercase, number, special)
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * URL validation regex
 */
const URL_REGEX = /^https?:\/\/.+/;

/**
 * Username regex (alphanumeric, underscore, hyphen, 3-20 chars)
 */
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

/**
 * Sanitization helpers
 */
function sanitizeString(value: string): string {
  return value.trim().replace(/[<>]/g, '');
}

/**
 * Validate and sanitize input
 */
export async function validateRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): Promise<ValidationResult<z.infer<T>>> {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.issues };
    }
    throw error;
  }
}

/**
 * Sanitize input string to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const authSchemas = {
  /** Login request validation */
  login: z.object({
    email: z.string()
      .min(1, VALIDATION_ERRORS.REQUIRED)
      .email(VALIDATION_ERRORS.INVALID_EMAIL)
      .transform(sanitizeString),
    password: z.string()
      .min(1, VALIDATION_ERRORS.REQUIRED),
  }),

  /** Registration request validation */
  register: z.object({
    email: z.string()
      .min(1, VALIDATION_ERRORS.REQUIRED)
      .email(VALIDATION_ERRORS.INVALID_EMAIL)
      .transform(sanitizeString),
    password: z.string()
      .min(8, VALIDATION_ERRORS.INVALID_PASSWORD)
      .regex(PASSWORD_REGEX, VALIDATION_ERRORS.INVALID_PASSWORD),
    confirmPassword: z.string(),
    firstName: z.string().min(1, VALIDATION_ERRORS.REQUIRED).max(50),
    lastName: z.string().min(1, VALIDATION_ERRORS.REQUIRED).max(50),
  }).refine(data => data.password === data.confirmPassword, {
    message: VALIDATION_ERRORS.PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  }),

  /** Password reset request */
  passwordResetRequest: z.object({
    email: z.string()
      .min(1, VALIDATION_ERRORS.REQUIRED)
      .email(VALIDATION_ERRORS.INVALID_EMAIL),
  }),

  /** Password reset confirmation */
  passwordResetConfirm: z.object({
    token: z.string().min(1, VALIDATION_ERRORS.REQUIRED),
    password: z.string()
      .min(8, VALIDATION_ERRORS.INVALID_PASSWORD)
      .regex(PASSWORD_REGEX, VALIDATION_ERRORS.INVALID_PASSWORD),
    confirmPassword: z.string(),
  }).refine(data => data.password === data.confirmPassword, {
    message: VALIDATION_ERRORS.PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  }),

  /** Change password (authenticated) */
  changePassword: z.object({
    currentPassword: z.string().min(1, VALIDATION_ERRORS.REQUIRED),
    newPassword: z.string()
      .min(8, VALIDATION_ERRORS.INVALID_PASSWORD)
      .regex(PASSWORD_REGEX, VALIDATION_ERRORS.INVALID_PASSWORD),
    confirmNewPassword: z.string(),
  }).refine(data => data.newPassword === data.confirmNewPassword, {
    message: VALIDATION_ERRORS.PASSWORD_MISMATCH,
    path: ['confirmNewPassword'],
  }),
};

// ============================================================================
// API SCHEMAS
// ============================================================================

export const apiSchemas = {
  /** Generic ID parameter */
  idParam: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),

  /** Pagination parameters */
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),

  /** Date range filter */
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  /** Search query */
  search: z.object({
    q: z.string().max(200).optional(),
  }),

  /** Sort parameters */
  sort: z.object({
    sortBy: z.string().max(50).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  /** JSON patch operation (RFC 6902) */
  jsonPatch: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
    path: z.string().regex(/^\/[a-zA-Z0-9\/._-]*$/, 'Invalid JSON Pointer'),
    value: z.unknown().optional(),
  })),
};

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const userSchemas = {
  /** User profile update */
  profileUpdate: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    timezone: z.string().max(50).optional(),
  }),

  /** User settings */
  userSettings: z.object({
    emailNotifications: z.boolean().default(true),
    pushNotifications: z.boolean().default(true),
    marketingEmails: z.boolean().default(false),
    language: z.string().max(10).default('en'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    twoFactorEnabled: z.boolean().optional(),
  }),

  /** Role assignment (admin only) */
  roleAssignment: z.object({
    userId: z.string().uuid(),
    role: z.enum(['researcher', 'policymaker', 'advocate', 'admin']),
  }),
};

// ============================================================================
// VALIDATION SCHEMA TYPE
// ============================================================================

/**
 * Type for validation schema
 */
export type ValidationSchema = z.ZodSchema;
