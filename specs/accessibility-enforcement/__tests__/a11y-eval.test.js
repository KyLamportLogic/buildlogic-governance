"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyA11yConfig,
  validateExemptions,
  evaluateAxe,
  evaluateLighthouse,
  buildResult,
} = require("../scripts/a11y-eval.js");

const UI_YAML = `
ui: true
build: "npm ci && npm run build"
preview: "npx serve -s dist -l 4321"
wait_on: "http://localhost:4321"
urls:
  - "http://localhost:4321/"
  - "http://localhost:4321/about"
`;

const NO_UI_YAML = `
ui: false
rationale: "Shell automation library; serves no web interface."
`;

// --- Config classification (REQ-F1/F2/A4) ---

test("case: ui:true config is recognized", () => {
  const c = classifyA11yConfig(UI_YAML);
  assert.equal(c.status, "ui");
  assert.deepEqual(c.config.urls, ["http://localhost:4321/", "http://localhost:4321/about"]);
});

test("case (d): ui:false passes trivially with rationale", () => {
  const c = classifyA11yConfig(NO_UI_YAML);
  assert.equal(c.status, "no-ui");
  const r = buildResult({ classify: c });
  assert.equal(r.passed, true);
  assert.equal(r.manualChecklistRequired, false);
  assert.match(r.summary, /declared no-UI/);
});

test("case (e): undeclared (no file) fails, distinct from exempt", () => {
  const c = classifyA11yConfig(null);
  assert.equal(c.status, "undeclared");
  const r = buildResult({ classify: c });
  assert.equal(r.passed, false);
  assert.match(r.summary, /undeclared/);
});

test("ui:false without rationale is undeclared (not a silent pass)", () => {
  const c = classifyA11yConfig("ui: false\n");
  assert.equal(c.status, "undeclared");
});

test("ui:true missing urls is undeclared", () => {
  const c = classifyA11yConfig('ui: true\nbuild: "x"\n');
  assert.equal(c.status, "undeclared");
});

// --- axe hard gate (REQ-B1/B2) ---

test("case (a): clean UI passes (0 critical/serious)", () => {
  const axe = evaluateAxe([{ impact: "moderate" }, { impact: "minor" }]);
  assert.equal(axe.passed, true);
  const r = buildResult({
    classify: classifyA11yConfig(UI_YAML),
    exemptions: { ok: true, active: [], errors: [] },
    axe,
    lighthouse: evaluateLighthouse(0.99),
  });
  assert.equal(r.passed, true);
  assert.match(r.summary, /manual checklist REQUIRED/);
});

test("case (b): a serious violation fails", () => {
  const axe = evaluateAxe([{ impact: "serious" }]);
  assert.equal(axe.passed, false);
  const r = buildResult({
    classify: classifyA11yConfig(UI_YAML),
    exemptions: { ok: true, active: [], errors: [] },
    axe,
    lighthouse: evaluateLighthouse(0.99),
  });
  assert.equal(r.passed, false);
  assert.match(r.summary, /critical\/serious/);
});

test("a critical violation fails", () => {
  assert.equal(evaluateAxe([{ impact: "critical" }]).passed, false);
});

// --- Lighthouse threshold (REQ-B3) ---

test("case (c): Lighthouse 0.94 fails", () => {
  const lh = evaluateLighthouse(0.94);
  assert.equal(lh.passed, false);
  const r = buildResult({
    classify: classifyA11yConfig(UI_YAML),
    exemptions: { ok: true, active: [], errors: [] },
    axe: evaluateAxe([]),
    lighthouse: lh,
  });
  assert.equal(r.passed, false);
  assert.match(r.summary, /Lighthouse accessibility 0.94 < 0.95/);
});

test("Lighthouse exactly 0.95 passes", () => {
  assert.equal(evaluateLighthouse(0.95).passed, true);
});

// --- Exemptions (REQ-E2) ---

test("case (f): expired exemption fails, never silent", () => {
  const yaml = `
exemptions:
  - scope: "http://localhost:4321/legacy"
    reason: "iframe"
    approver: "Ky"
    created: "2026-01-01"
    expires: "2026-02-01"
`;
  const ex = validateExemptions(yaml, new Date("2026-10-14T00:00:00Z"));
  assert.equal(ex.ok, false);
  assert.match(ex.errors[0], /expired/);
});

test("valid future exemption is active and surfaced", () => {
  const yaml = `
exemptions:
  - scope: "http://localhost:4321/legacy"
    reason: "iframe"
    approver: "Ky"
    created: "2026-10-01"
    expires: "2099-01-01"
`;
  const ex = validateExemptions(yaml, new Date("2026-10-14T00:00:00Z"));
  assert.equal(ex.ok, true);
  assert.equal(ex.active.length, 1);
});

test("exemption missing a field fails", () => {
  const yaml = `
exemptions:
  - scope: "x"
    reason: "y"
    approver: "Ky"
    created: "2026-10-01"
`;
  const ex = validateExemptions(yaml, new Date("2026-10-14T00:00:00Z"));
  assert.equal(ex.ok, false);
  assert.match(ex.errors[0], /missing required field/);
});

test("no exemptions file is ok (empty active set)", () => {
  const ex = validateExemptions(null);
  assert.equal(ex.ok, true);
  assert.equal(ex.active.length, 0);
});
