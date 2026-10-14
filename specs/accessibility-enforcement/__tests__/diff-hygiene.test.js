"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateDiffHygiene, matchStrayFiles, filesOutsideManifest } = require("../scripts/diff-hygiene.js");

const MANIFEST = ["src/", "specs/accessibility-enforcement/", "package.json"];

test("case (a): clean minimal diff passes", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["src/app.tsx", "specs/accessibility-enforcement/design.md"],
    manifest: MANIFEST,
    addedDeps: [],
    perFileChangedLines: { "src/app.tsx": 20 },
    lintPassed: true,
  });
  assert.equal(r.passed, true);
  assert.equal(r.blocking.length, 0);
});

test("case (b): stray debug.log blocks", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["src/app.tsx", "debug.log"],
    manifest: MANIFEST,
    addedDeps: [],
    perFileChangedLines: {},
    lintPassed: true,
  });
  assert.equal(r.passed, false);
  assert.match(r.blocking.join(" "), /stray files/);
});

test("case (c): undeclared new dependency blocks", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["package.json"],
    manifest: MANIFEST,
    addedDeps: ["left-pad"],
    perFileChangedLines: { "package.json": 3 },
    lintPassed: true,
  });
  assert.equal(r.passed, false);
  assert.match(r.blocking.join(" "), /undeclared new dependencies: left-pad/);
});

test("case (d): file outside declared manifest blocks", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["src/app.tsx", "unrelated/other.ts"],
    manifest: MANIFEST,
    addedDeps: [],
    perFileChangedLines: {},
    lintPassed: true,
  });
  assert.equal(r.passed, false);
  assert.match(r.blocking.join(" "), /outside declared manifest: unrelated\/other.ts/);
});

test("case (e): large hunk is advisory only, does NOT block", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["src/app.tsx"],
    manifest: MANIFEST,
    addedDeps: [],
    perFileChangedLines: { "src/app.tsx": 999 },
    lintPassed: true,
  });
  assert.equal(r.passed, true); // not blocked
  assert.match(r.advisory.join(" "), /large change in src\/app.tsx/);
});

test("lint failure blocks (deterministic)", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["src/app.tsx"],
    manifest: MANIFEST,
    addedDeps: [],
    perFileChangedLines: {},
    lintPassed: false,
  });
  assert.equal(r.passed, false);
  assert.match(r.blocking.join(" "), /lint\/format gate failed/);
});

test("declared dependency does not block", () => {
  const r = evaluateDiffHygiene({
    changedFiles: ["package.json"],
    manifest: ["package.json", "add dep: left-pad for padding"],
    addedDeps: ["left-pad"],
    perFileChangedLines: {},
    lintPassed: true,
  });
  assert.equal(r.passed, true);
});

test("prefix manifest entry covers nested files", () => {
  assert.equal(filesOutsideManifest(["src/a/b/c.ts"], ["src/"]).length, 0);
});

test("node_modules committed is a stray match", () => {
  assert.ok(matchStrayFiles(["node_modules/x/index.js"]).length > 0);
});
