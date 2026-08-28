/**
 * Auto-provision the ZeroAPI / RAG AI API key.
 *
 * A human-typed Infisical value is not required for the security property:
 * callers must present a secret they cannot guess. Generating a 256-bit
 * random key on first use, persisting it, and aliasing ZEROAPI_AI_API_KEYS
 * with RAG_API_KEY keeps fail-close auth without a manual setup step.
 *
 * Host-injected env (Infisical, Railway, start-dev .env) always wins.
 * Edge runtimes cannot persist — they read env only (start-dev / entrypoint
 * must have run ensure first).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ENV_NAMES = ['ZEROAPI_AI_API_KEYS', 'RAG_API_KEY'];

function firstConfigured(env) {
  for (const name of ENV_NAMES) {
    const raw = env[name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) return value;
  }
  return '';
}

function applyToEnv(env, value) {
  env.ZEROAPI_AI_API_KEYS = value;
  env.RAG_API_KEY = value;
}

function defaultPersistPath() {
  if (process.env.ZEROAPI_AI_API_KEYS_FILE) {
    return process.env.ZEROAPI_AI_API_KEYS_FILE;
  }
  return path.join(process.cwd(), '.data', 'zeroapi-ai-api-keys');
}

function defaultReadFile(persistPath) {
  return fs.readFileSync(persistPath, 'utf8');
}

function defaultWriteFile(persistPath, contents) {
  fs.mkdirSync(path.dirname(persistPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(persistPath, contents, { encoding: 'utf8', mode: 0o600 });
}

function defaultRandomKey() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   persistPath?: string,
 *   readFile?: (p: string) => string,
 *   writeFile?: (p: string, contents: string) => void,
 *   randomKey?: () => string,
 * }} [options]
 * @returns {{ value: string, source: 'env'|'file'|'generated', persisted: boolean }}
 */
function ensureAiApiKeys(options = {}) {
  const env = options.env || process.env;
  const persistPath = options.persistPath || defaultPersistPath();
  const readFile = options.readFile || defaultReadFile;
  const writeFile = options.writeFile || defaultWriteFile;
  const randomKey = options.randomKey || defaultRandomKey;

  const fromEnv = firstConfigured(env);
  if (fromEnv) {
    applyToEnv(env, fromEnv);
    return { value: fromEnv, source: 'env', persisted: false };
  }

  try {
    const fromFile = String(readFile(persistPath) || '').trim();
    if (fromFile) {
      applyToEnv(env, fromFile);
      return { value: fromFile, source: 'file', persisted: true };
    }
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      // Unreadable persist file: generate rather than fail-open.
    }
  }

  const generated = randomKey();
  let persisted = false;
  try {
    writeFile(persistPath, `${generated}\n`);
    persisted = true;
  } catch {
    persisted = false;
  }
  applyToEnv(env, generated);
  return { value: generated, source: 'generated', persisted };
}

module.exports = {
  ensureAiApiKeys,
  ENV_NAMES,
};
