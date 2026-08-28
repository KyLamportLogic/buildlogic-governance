/**
 * @kypython/buildlogic-logger - Unified structured logging
 *
 * Wraps Sentry.logger with optional New Relic support.
 * Provides consistent structured logging API across all apps.
 *
 * Usage:
 *   import { logger } from '@kypython/buildlogic-logger';
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('Payment failed', { orderId: '456', error });
 */

import * as Sentry from "@sentry/node";

// ---------------------------------------------------------------------------
// New Relic — optional integration (lazy-loaded, graceful no-op if missing)
// ---------------------------------------------------------------------------
interface NRAgent {
  recordCustomEvent(eventType: string, attributes: Record<string, unknown>): void;
  recordMetric(name: string, value: number): void;
  noticeError(error: Error | string, customAttributes?: Record<string, unknown>): void;
}

function getNR(): NRAgent | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional peer dependency
    return require('newrelic') as NRAgent;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Structured log entry format (matches EasyFlow standard)
// ---------------------------------------------------------------------------
export interface LogContext {
  [key: string]: unknown;
  service?: string;
  request_id?: string;
  user_id?: string;
  workflow_id?: string;
  environment?: string;
  version?: string;
  traceId?: string;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------
export interface Logger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  fatal(message: string, error?: Error | unknown, context?: LogContext): void;
  
  // Template literal helper for structured logging
  fmt: (strings: TemplateStringsArray, ...values: unknown[]) => string;
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------
class EmpireLogger implements Logger {
  private readonly serviceName: string;
  private readonly nr: NRAgent | null;

  constructor(serviceName: string = 'unknown') {
    this.serviceName = serviceName;
    this.nr = getNR();
  }

  private enrichContext(context?: LogContext): LogContext {
    const enriched: LogContext = {
      service: this.serviceName,
      ...context,
    };

    if (typeof process.env.NODE_ENV === 'string') {
      enriched.environment = process.env.NODE_ENV;
    }

    const commitSha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
    if (typeof commitSha === 'string') {
      enriched.version = commitSha;
    }

    return enriched;
  }

  private logToSentry(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', message: string, context?: LogContext): void {
    const enriched = this.enrichContext(context);
    
    // Use Sentry.logger if available (requires enableLogs: true in Sentry.init)
    const sentryLogger = 'logger' in Sentry ? (Sentry as { logger?: { debug: (m: string, c?: unknown) => void; info: (m: string, c?: unknown) => void; warn: (m: string, c?: unknown) => void; error: (m: string, c?: unknown) => void; fatal: (m: string, c?: unknown) => void } })['logger'] : undefined;
    if (sentryLogger) {
      switch (level) {
        case 'trace':
        case 'debug':
          sentryLogger.debug(message, enriched);
          break;
        case 'info':
          sentryLogger.info(message, enriched);
          break;
        case 'warn':
          sentryLogger.warn(message, enriched);
          break;
        case 'error':
          sentryLogger.error(message, enriched);
          break;
        case 'fatal':
          sentryLogger.fatal(message, enriched);
          break;
      }
    } else {
      // Fallback to console if Sentry.logger not available
      const logFn = level === 'error' || level === 'fatal' ? console.error : 
                    level === 'warn' ? console.warn : 
                    level === 'debug' || level === 'trace' ? console.debug : 
                    console.log;
      logFn(`[${level.toUpperCase()}] ${message}`, enriched);
    }
  }

  trace(message: string, context?: LogContext): void {
    this.logToSentry('trace', message, context);
    if (this.nr) {
      this.nr.recordCustomEvent('LogTrace', { message, ...this.enrichContext(context) });
    }
  }

  debug(message: string, context?: LogContext): void {
    this.logToSentry('debug', message, context);
    if (this.nr) {
      this.nr.recordCustomEvent('LogDebug', { message, ...this.enrichContext(context) });
    }
  }

  info(message: string, context?: LogContext): void {
    this.logToSentry('info', message, context);
    if (this.nr) {
      this.nr.recordCustomEvent('LogInfo', { message, ...this.enrichContext(context) });
    }
  }

  warn(message: string, context?: LogContext): void {
    this.logToSentry('warn', message, context);
    if (this.nr) {
      this.nr.recordCustomEvent('LogWarn', { message, ...this.enrichContext(context) });
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const enriched = this.enrichContext(context);

    // Always log to console for visibility (Sentry is a silent no-op when not configured)
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}`, enriched, error.message);
    } else if (error) {
      console.error(`[ERROR] ${message}`, enriched, String(error));
    } else {
      this.logToSentry('error', message, enriched);
    }

    // Also send to Sentry if initialized
    const canCapture = Sentry && typeof Sentry.captureException === 'function';
    if (canCapture) {
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { message, ...enriched } });
      } else if (error) {
        Sentry.captureException(new Error(String(error)), { extra: { message, ...enriched } });
      }
    }

    // Log to New Relic if available
    if (this.nr) {
      if (error instanceof Error) {
        this.nr.noticeError(error, { message, ...enriched });
      } else if (error) {
        this.nr.noticeError(new Error(String(error)), { message, ...enriched });
      } else {
        this.nr.recordCustomEvent('LogError', { message, ...enriched });
      }
    }
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    const enriched = this.enrichContext(context);

    // Always log to console for visibility (Sentry is a silent no-op when not configured)
    if (error instanceof Error) {
      console.error(`[FATAL] ${message}`, enriched, error.message, error.stack);
    } else if (error) {
      console.error(`[FATAL] ${message}`, enriched, String(error));
    } else {
      this.logToSentry('fatal', message, enriched);
    }

    // Also send to Sentry if initialized
    const canCapture = Sentry && typeof Sentry.captureException === 'function';
    if (canCapture) {
      if (error instanceof Error) {
        Sentry.captureException(error, { level: 'fatal', extra: { message, ...enriched } });
      } else if (error) {
        Sentry.captureException(new Error(String(error)), { level: 'fatal', extra: { message, ...enriched } });
      }
    }

    // Log to New Relic if available
    if (this.nr) {
      if (error instanceof Error) {
        this.nr.noticeError(error, { message, level: 'fatal', ...enriched });
      } else if (error) {
        this.nr.noticeError(new Error(String(error)), { message, level: 'fatal', ...enriched });
      } else {
        this.nr.recordCustomEvent('LogFatal', { message, ...enriched });
      }
    }
  }

  // Template literal helper for structured logging
  fmt(strings: TemplateStringsArray, ...values: unknown[]): string {
    return strings.reduce((acc, str, i) => {
      const val = values[i] ?? '';
      return acc + str + String(val);
    }, '');
  }
}

// ---------------------------------------------------------------------------
// Default logger instance (service name from env or 'buildlogic')
// ---------------------------------------------------------------------------
const defaultServiceName = process.env.SERVICE_NAME ?? 
                           process.env.NEXT_PUBLIC_SERVICE_NAME ?? 
                           'buildlogic';

export const logger = new EmpireLogger(defaultServiceName);

// ---------------------------------------------------------------------------
// Factory function to create logger for specific service
// ---------------------------------------------------------------------------
export function createLogger(serviceName: string): Logger {
  return new EmpireLogger(serviceName);
}
