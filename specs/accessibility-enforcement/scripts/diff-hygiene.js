"use strict";

/**
 * Diff-hygiene enforcement core (group K of specs/accessibility-enforcement).
 * Deterministic guards (block merge) vs advisory heuristics (reviewer judgment),
 * clearly separated so a partial gate is never presented as complete (REQ-K5).
 *
 * Dependency-free. Operates on a list of changed files + the declared
 * "files touched" manifest + added-dependency names. The workflow computes the
 * git base..head diff and passes the data in.
 */

// REQ-K2 — stray-file patterns that must never appear in a diff.
const STRAY_PATTERNS = [
  /\.log$/i,
  /\.tmp$/i,
  /(^|\/)debug[^/]*$/i,
  /(^|\/)scratch[^/]*$/i,
  /\.sw[op]$/i, // vim swap
  /(^|\/)\.DS_Store$/i,
  /(^|\/)node_modules\//,
];

function matchStrayFiles(changedFiles) {
  return (changedFiles || []).filter((f) => STRAY_PATTERNS.some((re) => re.test(f)));
}

/**
 * REQ-K3 — scope-manifest guard. Every changed file must be covered by the
 * declared manifest (exact path or a prefix ending in '/'). Files outside fail.
 */
function filesOutsideManifest(changedFiles, manifest) {
  const entries = (manifest || []).map((m) => String(m).trim()).filter(Boolean);
  const covers = (file) =>
    entries.some((e) => (e.endsWith("/") ? file.startsWith(e) : file === e));
  return (changedFiles || []).filter((f) => !covers(f));
}

/**
 * REQ-K2 — new-dependency guard. Any added runtime dependency must be declared
 * in the manifest (listed as a touched concern) or it blocks.
 */
function undeclaredDependencies(addedDeps, manifest) {
  const declaredBlob = (manifest || []).join("\n");
  return (addedDeps || []).filter((d) => !declaredBlob.includes(d));
}

/**
 * REQ-K4 — advisory heuristics. Return non-blocking flags for human review:
 *   - large hunks (> hunkLineThreshold changed lines in one file)
 *   - many files touched (> fileCountThreshold) suggesting unrequested scope
 * These never affect the deterministic pass/fail.
 */
function advisoryFlags(changedFiles, perFileChangedLines, opts = {}) {
  const hunkLineThreshold = opts.hunkLineThreshold || 400;
  const fileCountThreshold = opts.fileCountThreshold || 30;
  const flags = [];
  for (const [file, lines] of Object.entries(perFileChangedLines || {})) {
    if (lines > hunkLineThreshold) {
      flags.push(`large change in ${file} (${lines} lines) — confirm it maps to the spec`);
    }
  }
  if ((changedFiles || []).length > fileCountThreshold) {
    flags.push(
      `${changedFiles.length} files touched — confirm none is unrequested scope (REQ-H9)`
    );
  }
  return flags;
}

/**
 * Compose the deterministic decision + advisory notes.
 * @returns {{passed:boolean, blocking:string[], advisory:string[], summary:string}}
 */
function evaluateDiffHygiene({ changedFiles, manifest, addedDeps, perFileChangedLines, lintPassed }) {
  const blocking = [];

  const stray = matchStrayFiles(changedFiles);
  if (stray.length) blocking.push(`stray files present: ${stray.join(", ")} (REQ-K2)`);

  const outside = filesOutsideManifest(changedFiles, manifest);
  if (outside.length)
    blocking.push(`files outside declared manifest: ${outside.join(", ")} (REQ-K3/H6)`);

  const undeclared = undeclaredDependencies(addedDeps, manifest);
  if (undeclared.length)
    blocking.push(`undeclared new dependencies: ${undeclared.join(", ")} (REQ-K2)`);

  if (lintPassed === false) blocking.push("lint/format gate failed (REQ-K2)");

  const advisory = advisoryFlags(changedFiles, perFileChangedLines);

  const passed = blocking.length === 0;
  const lines = [`Diff-hygiene: ${passed ? "PASS" : "FAIL"} [deterministic]`];
  if (!passed) {
    lines.push("  Blocking:");
    for (const b of blocking) lines.push(`    - ${b}`);
  }
  if (advisory.length) {
    lines.push("  Advisory (reviewer judgment, non-blocking — REQ-K4/K5):");
    for (const a of advisory) lines.push(`    - ${a}`);
  }
  return { passed, blocking, advisory, summary: lines.join("\n") };
}

module.exports = {
  matchStrayFiles,
  filesOutsideManifest,
  undeclaredDependencies,
  advisoryFlags,
  evaluateDiffHygiene,
  STRAY_PATTERNS,
};
