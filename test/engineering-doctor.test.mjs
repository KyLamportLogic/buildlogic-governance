import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../bin/engineering-doctor.mjs';

function fixture(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-doctor-'));
  fs.writeFileSync(path.join(root, '.engineering-doctor.json'), JSON.stringify(config, null, 2));
  return root;
}

test('passes a configured repository with formal trace bindings', () => {
  const root = fixture({
    version: 1,
    requirements: {
      source: 'REQ.md',
      requiredMarkdownHeadings: ['Must', 'Must Not', 'Non-functional'],
      requirementIdPattern: '(?:MNFR|NFR|FR)-\\d+',
      traceFiles: ['effect.test.mjs']
    },
    formal: {
      manifest: 'formal.json',
      model: 'model.tla',
      requiredStates: ['APPROVED', 'CONFIRMED'],
      requiredProperties: [
        { name: 'NoDispatchWithoutFreshPreflight', requirements: ['FR-12'] }
      ],
      traceBindings: [
        { file: 'effect.test.mjs', requirements: ['FR-12'] }
      ]
    }
  });

  fs.writeFileSync(path.join(root, 'REQ.md'), [
    '## Must',
    '| ID | Subject |',
    '| --- | --- |',
    '| FR-12 | Fresh preflight |',
    '## Must Not',
    '## Non-functional'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'formal.json'), JSON.stringify({
    states: ['APPROVED', 'CONFIRMED'],
    properties: [
      { name: 'NoDispatchWithoutFreshPreflight', kind: 'invariant', requirements: ['FR-12'] }
    ]
  }));
  fs.writeFileSync(path.join(root, 'model.tla'), 'APPROVED == 1\nCONFIRMED == 2\n');
  fs.writeFileSync(path.join(root, 'effect.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; // FR-12\ntest('x',()=>assert.ok(true));\n");

  const report = runDoctor({ root });
  assert.equal(report.ok, true, JSON.stringify(report.failed, null, 2));
});

test('reports every missing formal trace ID in one run', () => {
  const root = fixture({
    version: 1,
    formal: {
      manifest: 'formal.json',
      model: 'model.tla',
      traceBindings: [
        { file: 'effect.test.mjs', requirements: ['FR-12', 'FR-16'] },
        { file: 'reconciliation.test.mjs', requirements: ['FR-29'] }
      ]
    }
  });

  fs.writeFileSync(path.join(root, 'formal.json'), '{}');
  fs.writeFileSync(path.join(root, 'model.tla'), '---- MODULE X ----');
  fs.writeFileSync(path.join(root, 'effect.test.mjs'), '// FR-12');
  fs.writeFileSync(path.join(root, 'reconciliation.test.mjs'), '// no trace yet');

  const report = runDoctor({ root });
  assert.equal(report.ok, false);
  const failures = report.failed.filter((x) => x.id.startsWith('formal.trace:'));
  assert.equal(failures.length, 2);
  assert.deepEqual(failures[0].detail.missing_requirements, ['FR-16']);
  assert.deepEqual(failures[1].detail.missing_requirements, ['FR-29']);
});

test('rejects substring-only FR-10 evidence for FR-1 in all three trace gates', () => {
  const root = fixture({
    version: 1,
    requirements: { source: 'REQ.md', traceFiles: ['trace.test.mjs'] },
    formal: {
      manifest: 'formal.json',
      model: 'model.tla',
      requiredProperties: [{ name: 'GuardedDispatch', requirements: ['FR-1'] }],
      traceBindings: [{ file: 'trace.test.mjs', requirements: ['FR-1'] }]
    }
  });
  fs.writeFileSync(path.join(root, 'REQ.md'), '| ID | Subject |\n| --- | --- |\n| FR-1 | Guard dispatch |\n');
  fs.writeFileSync(path.join(root, 'trace.test.mjs'), '// FR-10 only\n');
  fs.writeFileSync(path.join(root, 'formal.json'), JSON.stringify({
    properties: [{ name: 'GuardedDispatch', kind: 'invariant', requirements: ['FR-10'] }]
  }));
  fs.writeFileSync(path.join(root, 'model.tla'), '---- MODULE X ----\n');
  const report = runDoctor({ root });
  const byId = (id) => report.checks.find((check) => check.id === id);
  assert.equal(byId('requirements.acceptance_trace').ok, false);
  assert.deepEqual(byId('requirements.acceptance_trace').detail.missing_ids, ['FR-1']);
  assert.equal(byId('formal.property:GuardedDispatch').ok, false);
  assert.deepEqual(byId('formal.property:GuardedDispatch').detail.missing_requirements, ['FR-1']);
  assert.equal(byId('formal.trace:trace.test.mjs').ok, false);
  assert.deepEqual(byId('formal.trace:trace.test.mjs').detail.missing_requirements, ['FR-1']);
});

test('ignores a tracked test removed from the working tree before staging', () => {
  const root = fixture({ version: 1, nonPlaceholderTestScopes: ['test'] });
  const testDir = path.join(root, 'test');
  fs.mkdirSync(testDir);
  const deleted = path.join(testDir, 'deleted.test.mjs');
  fs.writeFileSync(deleted, "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('real test', () => assert.ok(true));\n");
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'test/deleted.test.mjs'], { cwd: root });
  fs.unlinkSync(deleted);
  const report = runDoctor({ root });
  assert.equal(report.ok, true, JSON.stringify(report.failed, null, 2));
  assert.equal(report.checks.find((check) => check.id === 'tests.non_placeholder:test').ok, true);
});

test('executes the installed symlink entrypoint instead of exiting silently', { skip: process.platform === 'win32' }, () => {
  const root = fixture({ version: 1 });
  const link = path.join(root, 'engineering-doctor');
  fs.symlinkSync(fileURLToPath(new URL('../bin/engineering-doctor.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.id === 'config.loaded'));
});
