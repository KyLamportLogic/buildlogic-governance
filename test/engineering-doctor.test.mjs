import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
