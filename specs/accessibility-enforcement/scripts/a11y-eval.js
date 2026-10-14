"use strict";

/**
 * Accessibility enforcement — deterministic evaluation core.
 *
 * Home repo: KyLamportLogic/buildlogic-governance
 * Implements the machine-checkable parts of specs/accessibility-enforcement:
 *   - .a11y.yml parsing: ui:true config vs ui:false declaration vs undeclared (REQ-A4, REQ-F1, REQ-F2)
 *   - .a11y-exempt.yml validation: required fields + non-expired (REQ-E1, REQ-E2)
 *   - axe result evaluation: 0 critical/serious is the hard gate (REQ-B1, REQ-B2)
 *   - Lighthouse score evaluation: >= 0.95 (REQ-B3)
 *   - deterministic run summary + mandatory "manual checklist REQUIRED" notice (REQ-B4, REQ-I3)
 *
 * No third-party dependencies: a minimal YAML subset parser is included so the
 * reusable workflow needs nothing beyond Node. Keep this file dependency-free.
 */

const AXE_BLOCKING_IMPACTS = new Set(["critical", "serious"]);
const LIGHTHOUSE_MIN = 0.95;
const REQUIRED_EXEMPTION_FIELDS = ["scope", "reason", "approver", "created", "expires"];

/**
 * Minimal YAML subset parser sufficient for .a11y.yml and .a11y-exempt.yml.
 * Supports: scalars (string/bool/number), `key: value`, nested maps via indentation,
 * and sequences of maps / scalars with `- ` markers. Not a general YAML engine.
 */
function parseYaml(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "")) // strip comments
    .filter((l) => l.trim().length > 0);

  let index = 0;

  function indentOf(line) {
    return line.length - line.trimStart().length;
  }

  function parseScalar(raw) {
    const v = raw.trim();
    if (v === "") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    return v;
  }

  function parseBlock(minIndent) {
    // Decide list vs map by first line at this indent.
    const first = lines[index];
    if (first === undefined) return null;
    const isList = first.trim().startsWith("- ");
    return isList ? parseList(minIndent) : parseMap(minIndent);
  }

  function parseList(minIndent) {
    const out = [];
    while (index < lines.length) {
      const line = lines[index];
      const ind = indentOf(line);
      if (ind < minIndent || !line.trim().startsWith("- ")) break;
      const afterDash = line.slice(ind + 2);
      // A dashed item is a map only when it has a real `key:` separator —
      // not when it is a quoted/plain scalar that merely contains a colon
      // (e.g. a URL like "http://..."). (bugfix: URLs are scalars)
      const trimmedItem = afterDash.trim();
      const isQuotedScalar =
        (trimmedItem.startsWith('"') && trimmedItem.endsWith('"')) ||
        (trimmedItem.startsWith("'") && trimmedItem.endsWith("'"));
      const hasMapKey = !isQuotedScalar && /^[A-Za-z0-9_-]+\s*:/.test(trimmedItem);
      if (hasMapKey) {
        // list item is a map; rewrite the first key inline, then continue the map
        lines[index] = " ".repeat(ind + 2) + afterDash;
        const item = parseMap(ind + 2);
        out.push(item);
      } else {
        out.push(parseScalar(afterDash));
        index += 1;
      }
    }
    return out;
  }

  function parseMap(minIndent) {
    const out = {};
    while (index < lines.length) {
      const line = lines[index];
      const ind = indentOf(line);
      if (ind < minIndent) break;
      if (line.trim().startsWith("- ")) break;
      const colon = line.indexOf(":");
      if (colon === -1) {
        index += 1;
        continue;
      }
      const key = line.slice(ind, colon).trim();
      const rest = line.slice(colon + 1).trim();
      index += 1;
      if (rest === "") {
        // nested block
        const next = lines[index];
        if (next !== undefined && indentOf(next) > ind) {
          out[key] = parseBlock(ind + 1);
        } else {
          out[key] = null;
        }
      } else {
        out[key] = parseScalar(rest);
      }
    }
    return out;
  }

  const result = parseBlock(0);
  return result === null ? {} : result;
}

/**
 * Classify a repo's .a11y.yml declaration. (REQ-F1/F2/A4)
 * @returns {{status:'ui'|'no-ui'|'undeclared', config?:object, rationale?:string, error?:string}}
 */
function classifyA11yConfig(rawYamlOrNull) {
  if (rawYamlOrNull == null || String(rawYamlOrNull).trim() === "") {
    return {
      status: "undeclared",
      error:
        "undeclared: a repo must declare UI config (ui:true + build/preview/urls) or ui:false + rationale in .a11y.yml",
    };
  }
  let cfg;
  try {
    cfg = parseYaml(String(rawYamlOrNull));
  } catch (e) {
    return { status: "undeclared", error: `invalid .a11y.yml: ${e.message}` };
  }

  if (cfg.ui === false) {
    if (!cfg.rationale || String(cfg.rationale).trim() === "") {
      return {
        status: "undeclared",
        error: "ui:false requires a non-empty 'rationale' (REQ-F1)",
      };
    }
    return { status: "no-ui", rationale: String(cfg.rationale) };
  }

  if (cfg.ui === true) {
    const missing = ["build", "urls"].filter(
      (k) => cfg[k] == null || (Array.isArray(cfg[k]) && cfg[k].length === 0)
    );
    if (missing.length > 0) {
      return {
        status: "undeclared",
        error: `ui:true requires fields: ${missing.join(", ")} (REQ-A4)`,
      };
    }
    return { status: "ui", config: cfg };
  }

  return {
    status: "undeclared",
    error: "undeclared: .a11y.yml must set ui:true or ui:false (REQ-F2)",
  };
}

/**
 * Validate exemptions. Missing field OR expired => failure, never silent. (REQ-E1/E2/E3)
 * @param {string|null} rawYamlOrNull
 * @param {Date} now
 * @returns {{ok:boolean, active:object[], errors:string[]}}
 */
function validateExemptions(rawYamlOrNull, now = new Date()) {
  if (rawYamlOrNull == null || String(rawYamlOrNull).trim() === "") {
    return { ok: true, active: [], errors: [] };
  }
  let doc;
  try {
    doc = parseYaml(String(rawYamlOrNull));
  } catch (e) {
    return { ok: false, active: [], errors: [`invalid .a11y-exempt.yml: ${e.message}`] };
  }
  const entries = Array.isArray(doc.exemptions) ? doc.exemptions : [];
  const errors = [];
  const active = [];
  entries.forEach((entry, i) => {
    const e = entry || {};
    const missing = REQUIRED_EXEMPTION_FIELDS.filter(
      (f) => e[f] == null || String(e[f]).trim() === ""
    );
    if (missing.length > 0) {
      errors.push(`exemption[${i}] missing required field(s): ${missing.join(", ")} (REQ-E2)`);
      return;
    }
    const expires = new Date(String(e.expires));
    if (Number.isNaN(expires.getTime())) {
      errors.push(`exemption[${i}] has invalid 'expires' date: ${e.expires} (REQ-E2)`);
      return;
    }
    if (expires.getTime() < now.getTime()) {
      errors.push(
        `exemption[${i}] expired on ${e.expires} — expired exemptions fail, never silently lapse (REQ-E2)`
      );
      return;
    }
    active.push(e);
  });
  return { ok: errors.length === 0, active, errors };
}

/**
 * Evaluate axe-core results. Hard gate: 0 critical/serious. (REQ-B1/B2)
 * @param {Array<{impact:string}>} violations flat list across tested URLs
 */
function evaluateAxe(violations) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, other: 0 };
  for (const v of violations || []) {
    const impact = (v && v.impact) || "other";
    if (counts[impact] === undefined) counts.other += 1;
    else counts[impact] += 1;
  }
  const blocking = counts.critical + counts.serious;
  return {
    counts,
    blockingCount: blocking,
    passed: blocking === 0,
  };
}

/** Evaluate a Lighthouse accessibility score. (REQ-B3) */
function evaluateLighthouse(score) {
  const n = Number(score);
  return { score: n, passed: Number.isFinite(n) && n >= LIGHTHOUSE_MIN };
}

/**
 * Produce the deterministic overall result + summary.
 * Always appends the mandatory manual-checklist notice (REQ-B4/I3): a green
 * automated result is explicitly labeled partial, never "fully verified".
 */
function buildResult({ classify, exemptions, axe, lighthouse }) {
  // No-UI: trivial pass.
  if (classify.status === "no-ui") {
    return {
      passed: true,
      status: "no-ui",
      summary: [
        "Accessibility: declared no-UI — check passes trivially.",
        `Rationale: ${classify.rationale}`,
      ].join("\n"),
      manualChecklistRequired: false,
    };
  }
  // Undeclared: fail (distinct from exempt).
  if (classify.status === "undeclared") {
    return {
      passed: false,
      status: "undeclared",
      summary: `Accessibility: FAIL — ${classify.error}`,
      manualChecklistRequired: false,
    };
  }

  const reasons = [];
  if (exemptions && !exemptions.ok) reasons.push(...exemptions.errors);
  if (axe && !axe.passed)
    reasons.push(`axe-core: ${axe.blockingCount} critical/serious violation(s) (must be 0)`);
  if (lighthouse && !lighthouse.passed)
    reasons.push(`Lighthouse accessibility ${lighthouse.score} < ${LIGHTHOUSE_MIN}`);

  const passed = reasons.length === 0;
  const lines = [`Accessibility (WCAG 2.2 Level A): ${passed ? "PASS" : "FAIL"} [automated]`];
  if (axe) {
    lines.push(
      `  axe critical=${axe.counts.critical} serious=${axe.counts.serious} ` +
        `moderate=${axe.counts.moderate} minor=${axe.counts.minor} (critical/serious must be 0)`
    );
  }
  if (lighthouse) lines.push(`  Lighthouse accessibility score: ${lighthouse.score} (min ${LIGHTHOUSE_MIN})`);
  if (exemptions && exemptions.active.length > 0) {
    lines.push(`  Active exemptions (${exemptions.active.length}):`);
    for (const e of exemptions.active) lines.push(`    - ${e.scope} (expires ${e.expires}, by ${e.approver})`);
  }
  if (!passed) {
    lines.push("  Failures:");
    for (const r of reasons) lines.push(`    - ${r}`);
  }
  // REQ-B4 / REQ-I3 — never present the partial gate as complete.
  lines.push("  NOTE: manual checklist REQUIRED (keyboard-only + screen-reader). Automated pass alone is NOT full verification.");

  return { passed, status: "ui", summary: lines.join("\n"), manualChecklistRequired: true };
}

module.exports = {
  parseYaml,
  classifyA11yConfig,
  validateExemptions,
  evaluateAxe,
  evaluateLighthouse,
  buildResult,
  LIGHTHOUSE_MIN,
  AXE_BLOCKING_IMPACTS,
};
