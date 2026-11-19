#!/usr/bin/env node
'use strict';

const { rmSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const buildArtifacts = [
  '.packs',
  'packages/governance/dist',
  'packages/security/dist',
  'packages/logger/dist',
  'packages/governance-cli/dist',
  'packages/agentic-security/dist',
  'packages/agent-harness/dist',
  'packages/mcp-server/dist',
];

for (const relativePath of buildArtifacts) {
  rmSync(resolve(root, relativePath), { recursive: true, force: true });
}
