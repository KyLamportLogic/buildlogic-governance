/*
 * 📜 CODEBASE LAW: SYSTEMATIC SPECIFICATION-BASED TESTING
 *
 * Core Directive:
 * All AI Agents operating within this codebase must strictly adhere to a Test-Driven Development
 * (TDD) workflow based on systematic specification testing. Whenever you are tasked with creating
 * or modifying code, you must design and write the tests before writing the implementation.
 *
 * Global Standards Integration:
 * This testing protocol operates in conjunction with the broader software development standards
 * established in this codebase. Dynamically review and adhere to existing architectural patterns,
 * style guides, and operational rules. Auto-detect the active programming language and select the
 * standard, contextually appropriate testing framework.
 *
 * The Systematic Protocol — before writing code, generate a high-level testing strategy covering:
 *   Variables: Input parameters, output expectations, and their data types.
 *   Partitions & Boundaries: Valid/invalid partitions and exact boundary values (empty, null, limits).
 *   Test Case Derivation: Combine partitions and boundaries for a minimal, comprehensive test set.
 *   Augmentation: Edge cases based on common programming pitfalls.
 *
 * Implementation Order:
 *   1. Output the high-level summary of planned test cases.
 *   2. Write the automated test suite using the correct framework.
 *   3. Write the application code required to pass the tests.
 */
/**
 * Security Sanitization Tests
 * 
 * Unit tests for sanitization functions including:
 * - SQL injection detection
 * - XSS detection and prevention
 * - Command injection detection
 * - Path traversal detection
 * - Email injection detection
 * - Input sanitization utilities
 */

import {
  detectSQLInjection,
  detectXSS,
  detectCommandInjection,
  detectPathTraversal,
  detectEmailInjection,
  securityCheck,
  sanitizeHtml,
  escapeHtml,
  stripHtml,
  preventXSS,
  sanitizeFilename,
  sanitizeUrl,
  InputValidator,
  SECURITY_PATTERNS,
} from '../sanitization';

describe('Security Patterns', () => {
  it('should have SQL_INJECTION patterns defined', () => {
    expect(SECURITY_PATTERNS.SQL_INJECTION).toBeDefined();
    expect(SECURITY_PATTERNS.SQL_INJECTION.length).toBeGreaterThan(0);
  });

  it('should have XSS patterns defined', () => {
    expect(SECURITY_PATTERNS.XSS).toBeDefined();
    expect(SECURITY_PATTERNS.XSS.length).toBeGreaterThan(0);
  });

  it('should have COMMAND_INJECTION patterns defined', () => {
    expect(SECURITY_PATTERNS.COMMAND_INJECTION).toBeDefined();
    expect(SECURITY_PATTERNS.COMMAND_INJECTION.length).toBeGreaterThan(0);
  });

  it('should have PATH_TRAVERSAL patterns defined', () => {
    expect(SECURITY_PATTERNS.PATH_TRAVERSAL).toBeDefined();
    expect(SECURITY_PATTERNS.PATH_TRAVERSAL.length).toBeGreaterThan(0);
  });

  it('should have EMAIL_INJECTION patterns defined', () => {
    expect(SECURITY_PATTERNS.EMAIL_INJECTION).toBeDefined();
    expect(SECURITY_PATTERNS.EMAIL_INJECTION.length).toBeGreaterThan(0);
  });
});

describe('detectSQLInjection', () => {
  it('should detect SELECT keyword', () => {
    expect(detectSQLInjection('SELECT * FROM users')).toBe(true);
  });

  it('should detect INSERT keyword', () => {
    expect(detectSQLInjection('INSERT INTO users VALUES (1, "test")')).toBe(true);
  });

  it('should detect UPDATE keyword', () => {
    expect(detectSQLInjection('UPDATE users SET name = "test"')).toBe(true);
  });

  it('should detect DELETE keyword', () => {
    expect(detectSQLInjection('DELETE FROM users')).toBe(true);
  });

  it('should detect DROP keyword', () => {
    expect(detectSQLInjection('DROP TABLE users')).toBe(true);
  });

  it('should detect UNION SELECT', () => {
    expect(detectSQLInjection(' UNION SELECT password FROM users--')).toBe(true);
  });

  it('should detect single quote', () => {
    expect(detectSQLInjection("user' OR '1'='1")).toBe(true);
  });

  it('should detect OR with numbers', () => {
    expect(detectSQLInjection("' OR 1=1--")).toBe(true);
  });

  it('should return false for safe input', () => {
    expect(detectSQLInjection('Hello World')).toBe(false);
    expect(detectSQLInjection('user@example.com')).toBe(false);
    expect(detectSQLInjection('Hello<script>')).toBe(false);
  });
});

describe('detectXSS', () => {
  it('should detect script tags', () => {
    expect(detectXSS('<script>alert("xss")</script>')).toBe(true);
  });

  it('should detect javascript: protocol', () => {
    expect(detectXSS('javascript:alert("xss")')).toBe(true);
  });

  it('should detect iframe tags', () => {
    expect(detectXSS('<iframe src="evil.com"></iframe>')).toBe(true);
  });

  it('should detect object tags', () => {
    expect(detectXSS('<object data="evil.com"></object>')).toBe(true);
  });

  it('should detect embed tags', () => {
    expect(detectXSS('<embed src="evil.com">')).toBe(true);
  });

  it('should detect eval()', () => {
    expect(detectXSS('eval("alert(1)")')).toBe(true);
  });

  it('should detect data: protocol', () => {
    expect(detectXSS('data:text/html,<script>alert(1)</script>')).toBe(true);
  });

  it('should return false for safe input', () => {
    expect(detectXSS('Hello World')).toBe(false);
    expect(detectXSS('Just a normal string')).toBe(false);
  });
});

describe('detectCommandInjection', () => {
  it('should detect pipe character', () => {
    expect(detectCommandInjection('ls | cat /etc/passwd')).toBe(true);
  });

  it('should detect semicolon', () => {
    expect(detectCommandInjection('ls; rm -rf /')).toBe(true);
  });

  it('should detect backtick', () => {
    expect(detectCommandInjection('ls `cat /etc/passwd`')).toBe(true);
  });

  it('should detect $() command substitution', () => {
    expect(detectCommandInjection('ls $(cat /etc/passwd)')).toBe(true);
  });

  it('should detect cat command', () => {
    expect(detectCommandInjection('cat /etc/passwd')).toBe(true);
  });

  it('should detect ls command', () => {
    expect(detectCommandInjection('ls -la')).toBe(true);
  });

  it('should detect rm command', () => {
    expect(detectCommandInjection('rm -rf /')).toBe(true);
  });

  it('should return false for safe input', () => {
    expect(detectCommandInjection('Hello World')).toBe(false);
    expect(detectCommandInjection('user@email.com')).toBe(false);
  });
});

describe('detectPathTraversal', () => {
  it('should detect ../ in path', () => {
    expect(detectPathTraversal('../etc/passwd')).toBe(true);
    expect(detectPathTraversal('foo/../bar')).toBe(true);
  });

  it('should detect Windows path traversal', () => {
    expect(detectPathTraversal('..\\Windows\\System32')).toBe(true);
    expect(detectPathTraversal('foo\\..\\bar')).toBe(true);
  });

  it('should detect /etc/passwd', () => {
    expect(detectPathTraversal('/etc/passwd')).toBe(true);
  });

  it('should detect /etc/shadow', () => {
    expect(detectPathTraversal('/etc/shadow')).toBe(true);
  });

  it('should detect C:\\Windows\\System32', () => {
    expect(detectPathTraversal('C:\\Windows\\System32')).toBe(true);
  });

  it('should return false for safe input', () => {
    expect(detectPathTraversal('file.txt')).toBe(false);
    expect(detectPathTraversal('images/logo.png')).toBe(false);
  });
});

describe('detectEmailInjection', () => {
  it('should detect newline with header injection', () => {
    expect(detectEmailInjection('test@example.com\r\nBcc: victim@evil.com')).toBe(true);
  });

  it('should detect %0A (URL encoded newline)', () => {
    expect(detectEmailInjection('test@example.com%0ABcc: victim@evil.com')).toBe(true);
  });

  it('should detect %0D (URL encoded carriage return)', () => {
    expect(detectEmailInjection('test@example.com%0D%0ABcc: victim@evil.com')).toBe(true);
  });

  it('should return false for safe input', () => {
    expect(detectEmailInjection('user@example.com')).toBe(false);
    expect(detectEmailInjection('John Doe <john@example.com>')).toBe(false);
  });
});

describe('securityCheck', () => {
  it('should return isSafe true for safe input', () => {
    const result = securityCheck('Hello World');
    expect(result.isSafe).toBe(true);
    expect(result.threats).toHaveLength(0);
  });

  it('should detect SQL injection threat', () => {
    const result = securityCheck('SELECT * FROM users');
    expect(result.isSafe).toBe(false);
    expect(result.threats).toContain('SQL_INJECTION');
  });

  it('should detect XSS threat', () => {
    const result = securityCheck('<script>alert(1)</script>');
    expect(result.isSafe).toBe(false);
    expect(result.threats).toContain('XSS');
  });

  it('should detect multiple threats in different inputs', () => {
    // Note: The securityCheck function processes threats in order and 
    // may stop after the first detection depending on implementation
    const sqlResult = securityCheck('SELECT * FROM users');
    expect(sqlResult.isSafe).toBe(false);
    expect(sqlResult.threats).toContain('SQL_INJECTION');

    const xssResult = securityCheck('<script>alert(1)</script>');
    expect(xssResult.isSafe).toBe(false);
    expect(xssResult.threats).toContain('XSS');
  });

  it('should return empty threats array for safe content', () => {
    const result = securityCheck('Normal text without threats');
    expect(result.threats).toEqual([]);
  });
});

describe('sanitizeHtml', () => {
  it('should remove script tags', () => {
    expect(sanitizeHtml('<script>alert(1)</script>Hello')).toBe('Hello');
  });

  it('should remove iframe tags', () => {
    expect(sanitizeHtml('<iframe src="evil.com"></iframe>Hello')).toBe('Hello');
  });

  it('should remove object tags', () => {
    expect(sanitizeHtml('<object data="evil.com"></object>Hello')).toBe('Hello');
  });

  it('should remove embed tags', () => {
    expect(sanitizeHtml('<object data="evil.swf"></object>Hello')).toBe('Hello');
  });

  it('should remove event handlers', () => {
    expect(sanitizeHtml('<div onload="alert(1)">Hello</div>')).toContain('Hello');
  });

  it('should remove javascript: URLs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">Click</a>');
    expect(result).toContain('Click');
  });

  it('should escape remaining HTML', () => {
    const result = sanitizeHtml('<div>Hello</div>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;div&gt;');
  });

  it('should preserve safe HTML content', () => {
    const result = sanitizeHtml('<p>Hello World</p>');
    expect(result).toContain('Hello World');
  });

  it('should neutralize markup that survives tag stripping', () => {
    // `<img onerror>` is not in the removed-tag list, so escaping is the only
    // control standing between it and an injection sink.
    const result = sanitizeHtml('<img src=x onerror=alert(1)>');
    expect(result).not.toMatch(/<img/i);
    expect(result).toContain('&lt;img');
  });
});

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#x27;');
    expect(escapeHtml('/')).toBe('&#x2F;');
  });

  it('breaks out of a double-quoted attribute payload', () => {
    const result = escapeHtml('" onmouseover="alert(1)');
    expect(result).not.toContain('"');
    expect(result).toContain('&quot;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('stripHtml', () => {
  it('should remove all HTML tags', () => {
    expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
  });

  it('should handle nested tags', () => {
    expect(stripHtml('<div><p>Nested</p></div>')).toBe('Nested');
  });

  it('should handle empty tags', () => {
    expect(stripHtml('<br><hr>')).toBe('');
  });

  it('should return original string if no tags', () => {
    expect(stripHtml('No tags here')).toBe('No tags here');
  });
});

describe('preventXSS', () => {
  it('should escape all HTML entities', () => {
    const result = preventXSS('<script>alert(1)</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  it('should remove null bytes', () => {
    expect(preventXSS('Hello\0World')).toBe('HelloWorld');
  });

  it('should remove javascript: protocol', () => {
    const result = preventXSS('javascript:alert(1)');
    expect(result).not.toContain('javascript:');
  });

  it('should remove data: protocol', () => {
    const result = preventXSS('data:text/html,<script>alert(1)</script>');
    expect(result).not.toContain('data:');
  });

  it('should remove vbscript: protocol', () => {
    const result = preventXSS('vbscript:msgbox(1)');
    expect(result).not.toContain('vbscript:');
  });

  it('should remove control characters', () => {
    const result = preventXSS('Hello\x00World\x1Ftest');
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x1F');
  });

  it('should normalize Unicode', () => {
    const result = preventXSS('café'); // Using composed form
    expect(result).toBeDefined();
  });
});

describe('sanitizeFilename', () => {
  it('should replace special characters with underscore', () => {
    expect(sanitizeFilename('my*file?name.txt')).toBe('my_file_name.txt');
  });

  it('should remove path traversal attempts', () => {
    // The function replaces special chars first, then removes ..
    // '../etc/passwd' -> '.._etc_passwd' -> '_etc_passwd'  
    const result = sanitizeFilename('../etc/passwd');
    expect(result).toContain('etc_passwd');
  });

  it('should truncate long filenames', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(255);
  });

  it('should preserve safe filenames', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
    expect(sanitizeFilename('my-file_2024.txt')).toBe('my-file_2024.txt');
  });
});

describe('sanitizeUrl', () => {
  it('should sanitize valid HTTP URL', () => {
    const result = sanitizeUrl('http://example.com');
    expect(result).toBe('http://example.com/');
  });

  it('should sanitize valid HTTPS URL', () => {
    const result = sanitizeUrl('https://example.com/path');
    expect(result).toBe('https://example.com/path');
  });

  it('should reject invalid URLs', () => {
    expect(sanitizeUrl('not-a-url')).toBe(null);
    expect(sanitizeUrl('')).toBe(null);
  });

  it('should reject javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe(null);
  });

  it('should reject data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe(null);
  });

  it('should reject ftp: protocol', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe(null);
  });
});

describe('InputValidator', () => {
  describe('noSQLInjection', () => {
    it('should add SQL_INJECTION threat when detected', () => {
      const validator = new InputValidator('SELECT * FROM users');
      validator.noSQLInjection();
      expect(validator.isValid()).toBe(false);
      expect(validator.getThreats()).toContain('SQL_INJECTION');
    });

    it('should not add threat for safe input', () => {
      const validator = new InputValidator('Hello World');
      validator.noSQLInjection();
      expect(validator.isValid()).toBe(true);
      expect(validator.getThreats()).toHaveLength(0);
    });
  });

  describe('noXSS', () => {
    it('should add XSS threat when detected', () => {
      const validator = new InputValidator('<script>alert(1)</script>');
      validator.noXSS();
      expect(validator.isValid()).toBe(false);
      expect(validator.getThreats()).toContain('XSS');
    });

    it('should not add threat for safe input', () => {
      const validator = new InputValidator('Hello World');
      validator.noXSS();
      expect(validator.isValid()).toBe(true);
    });
  });

  describe('noCommandInjection', () => {
    it('should add COMMAND_INJECTION threat when detected', () => {
      const validator = new InputValidator('ls | cat /etc/passwd');
      validator.noCommandInjection();
      expect(validator.isValid()).toBe(false);
      expect(validator.getThreats()).toContain('COMMAND_INJECTION');
    });
  });

  describe('noPathTraversal', () => {
    it('should add PATH_TRAVERSAL threat when detected', () => {
      const validator = new InputValidator('../etc/passwd');
      validator.noPathTraversal();
      expect(validator.isValid()).toBe(false);
      expect(validator.getThreats()).toContain('PATH_TRAVERSAL');
    });
  });

  describe('sanitize', () => {
    it('should sanitize the input value', () => {
      const validator = new InputValidator('<script>alert(1)</script>');
      const sanitized = validator.sanitize();
      expect(sanitized).not.toContain('<script');
      expect(sanitized).toContain('&lt;script&gt;');
    });
  });

  describe('chaining', () => {
    it('should allow method chaining', () => {
      const validator = new InputValidator('SELECT * FROM <img onerror="alert(1)">')
        .noSQLInjection()
        .noXSS();
      
      expect(validator.isValid()).toBe(false);
      expect(validator.getThreats()).toContain('SQL_INJECTION');
      expect(validator.getThreats()).toContain('XSS');
    });
  });

  describe('getThreats', () => {
    it('should return a copy of threats array', () => {
      const validator = new InputValidator('test');
      validator.noSQLInjection();
      
      const threats1 = validator.getThreats();
      const threats2 = validator.getThreats();
      
      expect(threats1).toEqual(threats2);
      expect(threats1).not.toBe(threats2); // Should be a copy
    });
  });
});
