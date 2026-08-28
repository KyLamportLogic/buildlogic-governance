/**
 * Spec: ensureAiApiKeys — auto-create a random AI API key when none is configured.
 *
 * A human-typed secret is not required for security. A cryptographically random
 * key that is generated once, persisted, and injected into env is equivalent:
 * anonymous callers still cannot guess it; operators are not blocked on Infisical.
 *
 * ensureAiApiKeys({ env, persistPath, readFile, writeFile, randomKey })
 *   Partitions:
 *     - ZEROAPI_AI_API_KEYS set → use it, alias RAG_API_KEY, do not write
 *     - only RAG_API_KEY set → copy to ZEROAPI_AI_API_KEYS, do not write
 *     - both empty/whitespace, persist file has a value → load file, set both
 *     - both empty, no file (ENOENT) → generate, write, set both
 *     - write fails → still set in-process generated key (process is not left open)
 *   Boundaries: blank/whitespace env treated as unset; file with trailing newline trimmed.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ensureAiApiKeys } = require('../ensure-ai-api-keys.js');

function makeIo(overrides = {}) {
  const files = new Map(overrides.files || []);
  const writes = [];
  return {
    files,
    writes,
    readFile: (p) => {
      if (!files.has(p)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return files.get(p);
    },
    writeFile: (p, contents) => {
      writes.push({ path: p, contents });
      files.set(p, contents);
    },
    randomKey: () => 'generated-key-from-test',
  };
}

describe('ensureAiApiKeys', () => {
  it('uses ZEROAPI_AI_API_KEYS when set and aliases RAG_API_KEY without writing', () => {
    const io = makeIo();
    const env = { ZEROAPI_AI_API_KEYS: ' from-zeroapi ', RAG_API_KEY: '' };
    const result = ensureAiApiKeys({ env, persistPath: '/tmp/keys', ...io });

    assert.deepEqual(result, { value: 'from-zeroapi', source: 'env', persisted: false });
    assert.equal(env.ZEROAPI_AI_API_KEYS, 'from-zeroapi');
    assert.equal(env.RAG_API_KEY, 'from-zeroapi');
    assert.deepEqual(io.writes, []);
  });

  it('uses RAG_API_KEY when ZEROAPI_AI_API_KEYS is unset', () => {
    const io = makeIo();
    const env = { RAG_API_KEY: 'from-rag' };
    const result = ensureAiApiKeys({ env, persistPath: '/tmp/keys', ...io });

    assert.equal(result.source, 'env');
    assert.equal(env.ZEROAPI_AI_API_KEYS, 'from-rag');
    assert.equal(env.RAG_API_KEY, 'from-rag');
    assert.deepEqual(io.writes, []);
  });

  it('loads a persisted file when env is empty', () => {
    const io = makeIo({ files: [['/tmp/keys', 'persisted-key\n']] });
    const env = {};
    const result = ensureAiApiKeys({ env, persistPath: '/tmp/keys', ...io });

    assert.deepEqual(result, { value: 'persisted-key', source: 'file', persisted: true });
    assert.equal(env.ZEROAPI_AI_API_KEYS, 'persisted-key');
    assert.equal(env.RAG_API_KEY, 'persisted-key');
    assert.deepEqual(io.writes, []);
  });

  it('generates, persists, and injects both env names when nothing is configured', () => {
    const io = makeIo();
    const env = { ZEROAPI_AI_API_KEYS: '  ', RAG_API_KEY: '' };
    const result = ensureAiApiKeys({ env, persistPath: '/tmp/keys', ...io });

    assert.deepEqual(result, {
      value: 'generated-key-from-test',
      source: 'generated',
      persisted: true,
    });
    assert.equal(env.ZEROAPI_AI_API_KEYS, 'generated-key-from-test');
    assert.equal(env.RAG_API_KEY, 'generated-key-from-test');
    assert.deepEqual(io.writes, [{ path: '/tmp/keys', contents: 'generated-key-from-test\n' }]);
  });

  it('still injects a generated key when persist write fails (does not fail-open)', () => {
    const env = {};
    const result = ensureAiApiKeys({
      env,
      persistPath: '/tmp/keys',
      readFile: () => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      },
      writeFile: () => {
        throw new Error('EACCES');
      },
      randomKey: () => 'in-memory-only',
    });

    assert.deepEqual(result, { value: 'in-memory-only', source: 'generated', persisted: false });
    assert.equal(env.ZEROAPI_AI_API_KEYS, 'in-memory-only');
    assert.equal(env.RAG_API_KEY, 'in-memory-only');
  });
});
