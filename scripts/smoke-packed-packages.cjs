#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const expectedPackages = [
  ['@kypython/buildlogic-governance', 'kypython-buildlogic-governance-0.1.0.tgz'],
  ['@kypython/buildlogic-security', 'kypython-buildlogic-security-0.1.0.tgz'],
  ['@kypython/buildlogic-logger', 'kypython-buildlogic-logger-0.1.0.tgz'],
  ['@kypython/buildlogic-governance-cli', 'kypython-buildlogic-governance-cli-0.1.0.tgz'],
  ['@kypython/buildlogic-agentic-security', 'kypython-buildlogic-agentic-security-0.1.0.tgz'],
  ['@kypython/buildlogic-agent-harness', 'kypython-buildlogic-agent-harness-0.1.0.tgz'],
  ['@kypython/buildlogic-mcp-governance', 'kypython-buildlogic-mcp-governance-0.1.0.tgz'],
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function readPackedManifest(tarball) {
  const raw = run('tar', ['-xOf', tarball, 'package/package.json'], { capture: true });
  return JSON.parse(raw);
}

function readPackedEntries(tarball) {
  return run('tar', ['-tf', tarball], { capture: true }).trim().split('\n');
}

const consumer = mkdtempSync(join(tmpdir(), 'buildlogic-governance-consumer-'));

try {
  const tarballs = expectedPackages.map(([name, filename]) => {
    const tarball = join(root, '.packs', filename);
    const manifest = readPackedManifest(tarball);
    if (manifest.name !== name || manifest.version !== '0.1.0') {
      throw new Error(`Unexpected packed identity for ${filename}`);
    }
    if (manifest.license !== 'Apache-2.0') {
      throw new Error(`${name} must declare Apache-2.0`);
    }
    if (manifest.repository?.url !== 'git+https://github.com/KyLamportLogic/buildlogic-governance.git') {
      throw new Error(`${name} must declare the public provenance repository`);
    }
    if (JSON.stringify(manifest).includes('workspace:')) {
      throw new Error(`${name} contains an unresolved workspace dependency`);
    }
    const entries = readPackedEntries(tarball);
    if (!entries.includes('package/LICENSE')) throw new Error(`${name} is missing LICENSE`);
    if (entries.some((entry) => /(?:__tests__|\.(?:test|spec)\.(?:js|d\.ts)(?:\.map)?$)/.test(entry))) {
      throw new Error(`${name} ships test artifacts`);
    }
    return tarball;
  });

  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'packed-consumer-smoke', private: true, version: '1.0.0' }, null, 2)
  );
  run('npm', ['install', '--ignore-scripts', ...tarballs], { cwd: consumer });

  const cjsSmoke = `
    const governance = require('@kypython/buildlogic-governance');
    const security = require('@kypython/buildlogic-security');
    const expressRateLimit = require('@kypython/buildlogic-security/express-rate-limit-store');
    const logger = require('@kypython/buildlogic-logger');
    const agenticSecurity = require('@kypython/buildlogic-agentic-security');
    const harness = require('@kypython/buildlogic-agent-harness');
    if (typeof governance.gateAiSideEffect !== 'function') throw new Error('governance CJS export missing');
    if (typeof security.secret !== 'function') throw new Error('security CJS export missing');
    if (typeof security.checkUserRateLimit !== 'function') throw new Error('rate-limit CJS export missing');
    if (typeof expressRateLimit.createExpressRateLimitStore !== 'function') throw new Error('Express rate-limit adapter missing');
    if (typeof logger.createLogger !== 'function') throw new Error('logger CJS export missing');
    if (typeof agenticSecurity.gateAgenticSideEffect !== 'function') throw new Error('agentic security CJS export missing');
    if (typeof harness.createHarness !== 'function') throw new Error('agent harness CJS export missing');
  `;
  run(process.execPath, ['-e', cjsSmoke], { cwd: consumer });

  const esmSmoke = `
    const governance = await import('@kypython/buildlogic-governance');
    const security = await import('@kypython/buildlogic-security');
    const logger = await import('@kypython/buildlogic-logger');
    const agenticSecurity = await import('@kypython/buildlogic-agentic-security');
    const harness = await import('@kypython/buildlogic-agent-harness');
    const mcp = await import('@kypython/buildlogic-mcp-governance/server');
    if (typeof governance.gateAiSideEffect !== 'function') throw new Error('governance ESM export missing');
    if (typeof security.secret !== 'function') throw new Error('security ESM export missing');
    if (typeof logger.createLogger !== 'function') throw new Error('logger ESM export missing');
    if (typeof agenticSecurity.gateAgenticSideEffect !== 'function') throw new Error('agentic security ESM export missing');
    if (typeof harness.createHarness !== 'function') throw new Error('agent harness ESM export missing');
    if (typeof mcp.createGovernanceMcpServer !== 'function') throw new Error('MCP server export missing');
    let deniedMissingToken = false;
    try { mcp.createGovernanceMcpServer({ adminToken: '' }); } catch { deniedMissingToken = true; }
    if (!deniedMissingToken) throw new Error('MCP server accepted a missing admin token');
  `;
  run(process.execPath, ['--input-type=module', '-e', esmSmoke], { cwd: consumer });

  const contract = JSON.stringify({
    intent: 'verify the installed CLI package',
    logic_constraints: ['perform no mutation'],
    assumptions: [],
    fallback_strategy: 'abort',
  });
  const output = run(
    join(consumer, 'node_modules', '.bin', 'buildlogic-governance'),
    ['validate-contract', contract],
    { cwd: consumer, capture: true }
  );
  if (output.trim() !== 'valid') throw new Error('Installed CLI did not validate a valid contract');

  const installedCli = JSON.parse(
    readFileSync(join(consumer, 'node_modules', '@kypython', 'buildlogic-governance-cli', 'package.json'), 'utf8')
  );
  if (installedCli.dependencies?.['@kypython/buildlogic-governance'] !== '^0.1.0') {
    throw new Error('pnpm did not rewrite the CLI workspace dependency for publication');
  }

  process.stdout.write('Packed consumer smoke test passed.\n');
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
