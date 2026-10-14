#!/usr/bin/env node
"use strict";

/**
 * CI entrypoint for the accessibility gate. Thin wrapper over a11y-eval.js.
 * Reads (all optional except .a11y.yml discovery):
 *   --config <path>        default .a11y.yml
 *   --exempt <path>        default .a11y-exempt.yml
 *   --axe <path>           axe-core JSON (array of {impact} or {violations:[...]})
 *   --lighthouse <number>  lighthouse accessibility category score (0..1)
 *   --github-summary <path> optional: append summary (e.g. $GITHUB_STEP_SUMMARY)
 * Exit 0 = pass, 1 = fail. Deterministic. (REQ-A3/B1/B3/B4/F2/E2/I3)
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  classifyA11yConfig,
  validateExemptions,
  evaluateAxe,
  evaluateLighthouse,
  buildResult,
} = require("./a11y-eval.js");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function readIf(p) {
  try {
    return p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  } catch {
    return null;
  }
}

function flattenAxe(raw) {
  if (!raw) return [];
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(data)) {
    // either a flat [{impact}] or axe runs [{violations:[...]}]
    if (data.length && data[0] && Array.isArray(data[0].violations)) {
      return data.flatMap((run) => run.violations || []);
    }
    return data;
  }
  if (data && Array.isArray(data.violations)) return data.violations;
  return [];
}

function main() {
  const configPath = arg("config", ".a11y.yml");
  const exemptPath = arg("exempt", ".a11y-exempt.yml");
  const axePath = arg("axe", null);
  const lhRaw = arg("lighthouse", null);
  const summaryPath = arg("github-summary", process.env.GITHUB_STEP_SUMMARY || null);

  const classify = classifyA11yConfig(readIf(configPath));

  // --probe-only: just report classification (ui/no-ui/undeclared) and exit 0.
  // The workflow uses this to decide whether to build + scan. Not a gate decision.
  if (process.argv.includes("--probe-only")) {
    if (classify.status === "no-ui") process.stdout.write("declared no-UI\n");
    else if (classify.status === "undeclared") process.stdout.write(`undeclared: ${classify.error}\n`);
    else process.stdout.write("ui\n");
    process.exit(0);
  }

  let exemptions, axe, lighthouse;
  if (classify.status === "ui") {
    exemptions = validateExemptions(readIf(exemptPath));
    axe = evaluateAxe(flattenAxe(readIf(axePath)));
    lighthouse = lhRaw != null ? evaluateLighthouse(lhRaw) : undefined;
  }

  const result = buildResult({ classify, exemptions, axe, lighthouse });

  const header = `### Accessibility — WCAG 2.2 Level A\n\n`;
  const block = "```\n" + result.summary + "\n```\n";
  process.stdout.write(result.summary + "\n");
  if (summaryPath) {
    try {
      fs.appendFileSync(summaryPath, header + block);
    } catch {
      /* non-fatal: summary is cosmetic, gate decision is the exit code */
    }
  }

  process.exit(result.passed ? 0 : 1);
}

main();
