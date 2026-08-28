export interface UserRateLimitRuntimeOptions {
  windowMs?: number;
  max?: number;
  prefix?: string;
}

export interface UserRateLimitRuntimeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  count: number;
  backend: 'redis' | 'memory';
}

export function checkUserRateLimit(
  key: string,
  options?: UserRateLimitRuntimeOptions,
): Promise<UserRateLimitRuntimeResult>;

export function resetUserRateLimitMemoryForTests(): void;
export function setUserRateLimitRedisForTests(client: null | { eval: Function }): void;
export function memoryFallbackAllowed(): boolean;
