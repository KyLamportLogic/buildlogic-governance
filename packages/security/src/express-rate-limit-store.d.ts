export interface ExpressRateLimitStoreOptions {
  prefix?: string;
  windowMs?: number;
}

export interface ExpressRateLimitIncrementResult {
  totalHits: number;
  resetTime: Date;
}

export interface ExpressRateLimitStore {
  increment(key: string): Promise<ExpressRateLimitIncrementResult>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
  incr(
    key: string,
    callback: (
      error: unknown,
      totalHits?: number,
      resetTime?: Date
    ) => void
  ): void;
}

export function createExpressRateLimitStore(
  options?: ExpressRateLimitStoreOptions
): ExpressRateLimitStore;
