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
 * @kypython/buildlogic-logger - Unit Tests
 *
 * Tests for the unified structured logging package.
 */

import { createLogger, logger, LogContext } from '../index';

// Mock Sentry to avoid actual Sentry calls during testing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}), { virtual: true });

describe('@kypython/buildlogic-logger', () => {
  let mockConsoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to verify fallback logging
    mockConsoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockConsoleSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('should create a logger instance with custom service name', () => {
      const customLogger = createLogger('test-service');
      expect(customLogger).toBeDefined();
      expect(typeof customLogger.trace).toBe('function');
      expect(typeof customLogger.debug).toBe('function');
      expect(typeof customLogger.info).toBe('function');
      expect(typeof customLogger.warn).toBe('function');
      expect(typeof customLogger.error).toBe('function');
      expect(typeof customLogger.fatal).toBe('function');
      expect(typeof customLogger.fmt).toBe('function');
    });

    it('should create multiple loggers with different service names', () => {
      const logger1 = createLogger('service-a');
      const logger2 = createLogger('service-b');
      expect(logger1).not.toBe(logger2);
    });

    it('should allow calling all log methods without throwing', () => {
      const testLogger = createLogger('test');
      
      expect(() => testLogger.trace('trace message')).not.toThrow();
      expect(() => testLogger.debug('debug message')).not.toThrow();
      expect(() => testLogger.info('info message')).not.toThrow();
      expect(() => testLogger.warn('warn message')).not.toThrow();
      expect(() => testLogger.error('error message')).not.toThrow();
      expect(() => testLogger.fatal('fatal message')).not.toThrow();
    });
  });

  describe('default logger instance', () => {
    it('should have a default logger exported', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('LogContext interface', () => {
    it('should accept empty context', () => {
      const testLogger = createLogger('context-test');
      expect(() => testLogger.info('test', {})).not.toThrow();
      expect(() => testLogger.info('test')).not.toThrow();
    });

    it('should accept standard context fields', () => {
      const testLogger = createLogger('context-test');
      const context: LogContext = {
        service: 'test-service',
        request_id: 'req-123',
        user_id: 'user-456',
        workflow_id: 'wf-789',
        environment: 'test',
        version: '1.0.0',
        traceId: 'trace-abc',
      };
      expect(() => testLogger.info('test', context)).not.toThrow();
    });

    it('should accept custom context fields', () => {
      const testLogger = createLogger('context-test');
      const context: LogContext = {
        orderId: 'order-123',
        amount: 99.99,
        items: ['item1', 'item2'],
        metadata: { key: 'value' },
      };
      expect(() => testLogger.info('test', context)).not.toThrow();
    });
  });

  describe('log levels', () => {
    const testLogger = createLogger('log-level-test');

    it('should handle trace level', () => {
      expect(() => testLogger.trace('trace message')).not.toThrow();
      expect(() => testLogger.trace('trace with context', { user_id: '123' })).not.toThrow();
    });

    it('should handle debug level', () => {
      expect(() => testLogger.debug('debug message')).not.toThrow();
      expect(() => testLogger.debug('debug with context', { request_id: 'abc' })).not.toThrow();
    });

    it('should handle info level', () => {
      expect(() => testLogger.info('info message')).not.toThrow();
      expect(() => testLogger.info('info with context', { workflow_id: 'wf-1' })).not.toThrow();
    });

    it('should handle warn level', () => {
      expect(() => testLogger.warn('warn message')).not.toThrow();
      expect(() => testLogger.warn('warn with context', { traceId: 'trace-1' })).not.toThrow();
    });

    it('should handle error level with various error types', () => {
      // Error with Error object
      expect(() => testLogger.error('error with Error', new Error('test error'))).not.toThrow();
      
      // Error with string
      expect(() => testLogger.error('error with string', 'string error')).not.toThrow();
      
      // Error with number
      expect(() => testLogger.error('error with number', 404)).not.toThrow();
      
      // Error with null
      expect(() => testLogger.error('error with null', null)).not.toThrow();
      
      // Error with context
      expect(() => testLogger.error('error with context', new Error('err'), { user_id: '123' })).not.toThrow();
    });

    it('should handle fatal level with various error types', () => {
      expect(() => testLogger.fatal('fatal with Error', new Error('fatal error'))).not.toThrow();
      expect(() => testLogger.fatal('fatal with string', 'fatal string')).not.toThrow();
      expect(() => testLogger.fatal('fatal with context', new Error('err'), { critical: true })).not.toThrow();
    });
  });

  describe('fmt template literal helper', () => {
    const testLogger = createLogger('fmt-test');

    it('should create formatted strings with template literals', () => {
      const result = testLogger.fmt`Hello ${'World'}`;
      expect(result).toBe('Hello World');
    });

    it('should handle multiple values', () => {
      const name = 'Alice';
      const age = 30;
      const result = testLogger.fmt`User ${name} is ${age} years old`;
      expect(result).toBe('User Alice is 30 years old');
    });

    it('should handle undefined values', () => {
      let value: string | undefined;
      const result = testLogger.fmt`Value is ${value}`;
      expect(result).toBe('Value is ');
    });

    it('should handle null values', () => {
      const value: string | null = null;
      const result = testLogger.fmt`Value is ${value}`;
      expect(result).toBe('Value is ');
    });

    it('should handle numeric values', () => {
      const count = 42;
      const price = 19.99;
      const result = testLogger.fmt`You have ${count} items costing $${price}`;
      expect(result).toBe('You have 42 items costing $19.99');
    });

    it('should handle object values', () => {
      const obj = { name: 'test' };
      const result = testLogger.fmt`Object: ${obj}`;
      expect(result).toBe('Object: [object Object]');
    });

    it('should handle empty template', () => {
      const result = testLogger.fmt``;
      expect(result).toBe('');
    });

    it('should handle string-only template', () => {
      const result = testLogger.fmt`Just a string`;
      expect(result).toBe('Just a string');
    });
  });

  describe('context enrichment', () => {
    it('should enrich context with service name', () => {
      const testLogger = createLogger('enrichment-test');
      
      // The logger should add service name to context internally
      // We verify this doesn't throw
      expect(() => testLogger.info('test', { customField: 'value' })).not.toThrow();
    });

    it('should handle version from environment', () => {
      // Test without version
      delete process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      const logger1 = createLogger('no-version');
      expect(() => logger1.info('test')).not.toThrow();
      
      // Test with version
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = 'abc123';
      const logger2 = createLogger('with-version');
      expect(() => logger2.info('test')).not.toThrow();
      
      // Restore
      delete process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    });
  });

  describe('error handling robustness', () => {
    const testLogger = createLogger('error-robustness');

    it('should handle undefined error gracefully', () => {
      // Should not throw, though may produce warning
      expect(() => testLogger.error('test', undefined)).not.toThrow();
    });

    it('should handle non-Error object gracefully', () => {
      // Should not throw
      expect(() => testLogger.error('test', { not: 'an error' })).not.toThrow();
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      expect(() => testLogger.info(longMessage)).not.toThrow();
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Message with 🔒 emoji and "quotes" and \n newline';
      expect(() => testLogger.info(specialMessage)).not.toThrow();
    });

    it('should handle deeply nested context objects', () => {
      const nestedContext: LogContext = {
        level1: {
          level2: {
            level3: {
              level4: 'deep value',
            },
          },
        },
      };
      expect(() => testLogger.info('test', nestedContext)).not.toThrow();
    });

    it('should handle circular references in context (graceful failure)', () => {
      const circularContext: Record<string, unknown> = { value: 'test' };
      circularContext.self = circularContext;
      
      // Should not throw, though may produce warning
      expect(() => testLogger.info('test', circularContext as LogContext)).not.toThrow();
    });
  });
});
