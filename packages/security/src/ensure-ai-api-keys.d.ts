export const ENV_NAMES: ['ZEROAPI_AI_API_KEYS', 'RAG_API_KEY'];

export interface EnsureAiApiKeysOptions {
  env?: NodeJS.ProcessEnv;
  persistPath?: string;
  readFile?: (persistPath: string) => string;
  writeFile?: (persistPath: string, contents: string) => void;
  randomKey?: () => string;
}

export interface EnsureAiApiKeysResult {
  value: string;
  source: 'env' | 'file' | 'generated';
  persisted: boolean;
}

export function ensureAiApiKeys(options?: EnsureAiApiKeysOptions): EnsureAiApiKeysResult;
