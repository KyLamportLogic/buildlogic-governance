#!/usr/bin/env node
"use strict";

/**
 * CI entrypoint for the diff-hygiene gate. Thin wrapper over diff-hygiene.js.
 * Inputs:
 *   --changed "a,b,c"        comma-separated changed files (from git diff --name-only)
 *   --base <sha> --head <sha> used for per-file line counts + added-dep detection
 *   --manifest-file <path>   optional .pr-scope file (one entry/line)
 *   --github-summary <path>  optional summary append target
 * The declared "files touched" manifest is read from a .pr-scope file if present,
 * else from a "## Files touched" section in env PR_BODY (REQ-K3/H6).
 * Exit 0 = pass, 1 = deterministic failure. Advisory flags never affect exit code.
 */

const fs = require("node:fs");
const { execSync } = require("node:child_process");
const { evaluateDiffHygiene } = require("./diff-hygiene.js");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function parseManifest() {
  const file = arg("manifest-file", ".pr-scope");
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const body = process.env.PR_BODY || "";
  const m = body.match(/##\s*Files touched\s*\n([\s\S]*?)(\n##\s|$)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/`/g, "").trim())
    .filter(Boolean);
}

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function addedDependencies(base, head) {
  // Detect runtime deps added to any package.json in the diff.
  if (!base || !head) return [];
  const diff = sh(`git diff ${base} ${head} -- '**/package.json' package.json`);
  const added = [];
  let inDeps = false;
  for (const line of diff.split("\n")) {
    if (/^[+-]?\s*"(dependencies)"\s*:/.test(line)) inDeps = true;
    else if (/^[+-]?\s*"(devDependencies|peerDependencies|scripts)"\s*:/.test(line)) inDeps = false;
    if (inDeps && /^\+\s*"[^"]+"\s*:/.test(line)) {
      const name = line.match(/"([^"]+)"\s*:/);
      if (name) added.push(name[1]);
    }
  }
  return added;
}

function perFileLines(base, head, files) {
  const out = {};
  if (!base || !head) return out;
  for (const f of files) {
    const stat = sh(`git diff --numstat ${base} ${head} -- "${f}"`).trim();
    const parts = stat.split(/\s+/);
    const add = Number(parts[0]) || 0;
    const del = Number(parts[1]) || 0;
    out[f] = add + del;
  }
  return out;
}

function main() {
  const changedFiles = (arg("changed", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = arg("base", null);
  const head = arg("head", null);
  const manifest = parseManifest();

  const result = evaluateDiffHygiene({
    changedFiles,
    manifest,
    addedDeps: addedDependencies(base, head),
    perFileChangedLines: perFileLines(base, head, changedFiles),
    lintPassed: true, // lint/format run as a separate deterministic step in the caller
  });

  process.stdout.write(result.summary + "\n");
  const summaryPath = arg("github-summary", process.env.GITHUB_STEP_SUMMARY || null);
  if (summaryPath) {
    try {
      fs.appendFileSync(summaryPath, "### Diff-hygiene\n\n```\n" + result.summary + "\n```\n");
    } catch {
      /* non-fatal */
    }
  }
  process.exit(result.passed ? 0 : 1);
}

main();
