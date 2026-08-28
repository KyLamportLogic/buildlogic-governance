/**
 * Input Sanitization Module
 * 
 * Provides XSS prevention, SQL injection detection, and input sanitization
 * utilities for protecting against common web vulnerabilities.
 */

// ============================================================================
// SECURITY PATTERNS
// ============================================================================

/**
 * Known malicious patterns for detection
 */
export const SECURITY_PATTERNS = {
  /** SQL injection patterns */
  SQL_INJECTION: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\b)/i,
    /('|(\\')|(--)|(\#)|(\%27)|(\%23))/,
    /((\%3D)|=)[^\n]*((\%27)|')|(\%20)*(\b(OR|AND)\b)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(union\s+select)/i,
    /(\bor\b\s+\d+\s*=\s*\d+)/i,
  ],

  /** XSS patterns */
  XSS: [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
    /data\s*:/gi,
  ],

  /** Command injection patterns */
  COMMAND_INJECTION: [
    /[;&|`$]/,
    /\b(cat|ls|dir|rm|cp|mv|wget|curl|bash|sh|cmd)\b/i,
    /\b(echo|touch|mkdir|chmod|chown)\b/i,
  ],

  /** Path traversal patterns */
  PATH_TRAVERSAL: [
    /\.\.[\/\\]/,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /C:\\Windows\\System32/i,
  ],

  /** Email injection patterns */
  EMAIL_INJECTION: [
    /\r\n\s*(to|bcc|cc|from|subject)/i,
    /%0A/i,
    /%0D/i,
  ],
} as const;

/**
 * Compile regex patterns for performance
 */
const COMPILED_PATTERNS = {
  SQL_INJECTION: SECURITY_PATTERNS.SQL_INJECTION.map(p => new RegExp(p)),
  XSS: SECURITY_PATTERNS.XSS.map(p => new RegExp(p)),
  COMMAND_INJECTION: SECURITY_PATTERNS.COMMAND_INJECTION.map(p => new RegExp(p)),
  PATH_TRAVERSAL: SECURITY_PATTERNS.PATH_TRAVERSAL.map(p => new RegExp(p)),
  EMAIL_INJECTION: SECURITY_PATTERNS.EMAIL_INJECTION.map(p => new RegExp(p)),
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect SQL injection attempts
 */
export function detectSQLInjection(input: string): boolean {
  return COMPILED_PATTERNS.SQL_INJECTION.some(pattern => pattern.test(input));
}

/**
 * Detect XSS attempts
 */
export function detectXSS(input: string): boolean {
  return COMPILED_PATTERNS.XSS.some(pattern => pattern.test(input));
}

/**
 * Detect command injection attempts
 */
export function detectCommandInjection(input: string): boolean {
  return COMPILED_PATTERNS.COMMAND_INJECTION.some(pattern => pattern.test(input));
}

/**
 * Detect path traversal attempts
 */
export function detectPathTraversal(input: string): boolean {
  return COMPILED_PATTERNS.PATH_TRAVERSAL.some(pattern => pattern.test(input));
}

/**
 * Detect email injection attempts
 */
export function detectEmailInjection(input: string): boolean {
  return COMPILED_PATTERNS.EMAIL_INJECTION.some(pattern => pattern.test(input));
}

/**
 * Comprehensive security check
 */
export interface SecurityCheckResult {
  isSafe: boolean;
  threats: string[];
}

export function securityCheck(input: string): SecurityCheckResult {
  const threats: string[] = [];

  if (detectSQLInjection(input)) threats.push('SQL_INJECTION');
  if (detectXSS(input)) threats.push('XSS');
  if (detectCommandInjection(input)) threats.push('COMMAND_INJECTION');
  if (detectPathTraversal(input)) threats.push('PATH_TRAVERSAL');
  if (detectEmailInjection(input)) threats.push('EMAIL_INJECTION');

  return {
    isSafe: threats.length === 0,
    threats,
  };
}

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * HTML entities map for escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML special characters.
 *
 * Safe for both element text and quoted attribute values (single and double
 * quotes are both escaped). `&` is escaped first via the character class so
 * entities are never double-encoded.
 */
export function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"'\/]/g, char => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize HTML content (allow safe tags only)
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // Remove object/embed tags
  sanitized = sanitized.replace(/<(object|embed)\b[^<]*(?:(?!<\/(object|embed)>)<[^<]*)*<\/(object|embed)>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  
  // Escape remaining HTML
  return escapeHtml(sanitized);
}

/**
 * Strip all HTML tags
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Prevent XSS in user input
 */
export function preventXSS(input: string): string {
  let sanitized = input;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Normalize Unicode
  sanitized = sanitized.normalize('NFKC');
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Escape HTML
  sanitized = escapeHtml(sanitized);
  
  // Remove dangerous protocols
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/data\s*:/gi, '');
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');
  
  return sanitized;
}

/**
 * Sanitize filename (prevent path traversal)
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .substring(0, 255);
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    return parsed.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// INPUT VALIDATOR CLASS
// ============================================================================

/**
 * Input validator class for complex validation
 */
export class InputValidator {
  private value: string;
  private threats: string[] = [];

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Check for SQL injection
   */
  noSQLInjection(): this {
    if (detectSQLInjection(this.value)) {
      this.threats.push('SQL_INJECTION');
    }
    return this;
  }

  /**
   * Check for XSS
   */
  noXSS(): this {
    if (detectXSS(this.value)) {
      this.threats.push('XSS');
    }
    return this;
  }

  /**
   * Check for command injection
   */
  noCommandInjection(): this {
    if (detectCommandInjection(this.value)) {
      this.threats.push('COMMAND_INJECTION');
    }
    return this;
  }

  /**
   * Check for path traversal
   */
  noPathTraversal(): this {
    if (detectPathTraversal(this.value)) {
      this.threats.push('PATH_TRAVERSAL');
    }
    return this;
  }

  /**
   * Sanitize the value
   */
  sanitize(): string {
    return preventXSS(this.value);
  }

  /**
   * Get validation result
   */
  isValid(): boolean {
    return this.threats.length === 0;
  }

  /**
   * Get detected threats
   */
  getThreats(): string[] {
    return [...this.threats];
  }
}
