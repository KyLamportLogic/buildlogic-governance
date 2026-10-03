#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_IGNORES = [
  '.git/',
  'node_modules/',
  '.pnpm-store/',
  'dist/',
  'build/',
  'coverage/',
  '.turbo/',
];

function posix(rel) {
  return rel.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    const next = glob[i + 1];
    if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegExp(ch);
    }
  }
  return new RegExp(out + '$');
}

function matchesAny(rel, patterns = []) {
  return patterns.some((pattern) => {
    const normalized = String(pattern).replace(/^\.\//, '');
    if (normalized.endsWith('/')) return rel === normalized.slice(0, -1) || rel.startsWith(normalized);
    if (!/[?*]/.test(normalized)) return rel === normalized || rel.startsWith(normalized + '/');
    return globToRegExp(normalized).test(rel);
  });
}

export function findRepoRoot(start = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    let cursor = path.resolve(start);
    while (true) {
      if (fs.existsSync(path.join(cursor, '.git')) || fs.existsSync(path.join(cursor, 'package.json'))) {
        return cursor;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) return path.resolve(start);
      cursor = parent;
    }
  }
}

function listFiles(root) {
  try {
    const raw = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return raw.split(/\r?\n/).filter(Boolean).map((x) => posix(x));
  } catch {
    const out = [];
    const visit = (dir, relBase = '') => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) visit(full, rel);
        else if (ent.isFile()) out.push(posix(rel));
      }
    };
    visit(root);
    return out;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findNamedObject(value, name) {
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value) && value.name === name) return value;
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const child of values) {
    const found = findNamedObject(child, name);
    if (found) return found;
  }
  return null;
}

function lineHasHeading(text, heading) {
  const escaped = escapeRegExp(heading);
  return new RegExp(`^#{1,6}\\s+(?:\\d+[.)]\\s+)?${escaped}\\s*$`, 'mi').test(text);
}

function extractMarkdownTableRequirementIds(text, pattern) {
  const re = new RegExp(pattern || '(?:MNFR|NFR|FR)-\\d+', 'g');
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue;
    const firstCell = line.split('|')[1] || '';
    const match = firstCell.match(re);
    if (match?.[0]) ids.push(match[0]);
  }
  return ids;
}

function add(checks, id, ok, detail, remediation = null) {
  checks.push({ id, ok, detail, ...(remediation ? { remediation } : {}) });
}

function relExists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function resolveFileSpecs(root, files, specs = []) {
  const out = [];
  for (const spec of specs) {
    if (!spec) continue;
    if (/[?*]/.test(spec)) {
      for (const file of files) if (matchesAny(file, [spec])) out.push(file);
    } else if (relExists(root, spec)) {
      out.push(spec);
    }
  }
  return [...new Set(out)];
}

function universalChecks(root, files, config, checks) {
  const ignores = [...DEFAULT_IGNORES, ...(config.ignore || [])];
  const visible = files.filter((f) => !matchesAny(f, ignores));

  if (config.literalGlobFilenames !== false) {
    const bad = visible.filter((f) => /[*?\[\]]/.test(path.basename(f)));
    add(
      checks,
      'paths.literal_glob_filenames',
      bad.length === 0,
      bad,
      'Remove accidental literal glob filenames; expand globs before passing paths to write commands.'
    );
  }

  const tempPatterns = config.temporaryFiles || [];
  if (tempPatterns.length) {
    const bad = visible.filter((f) => matchesAny(f, tempPatterns));
    add(
      checks,
      'paths.temporary_files',
      bad.length === 0,
      bad,
      'Delete completed one-off repair tooling rather than inventorying it as durable product code.'
    );
  }

  if (config.rejectEmptyFiles) {
    const empty = visible.filter((f) => {
      try { return fs.statSync(path.join(root, f)).size === 0; } catch { return false; }
    });
    add(checks, 'files.no_empty_files', empty.length === 0, empty, 'Remove placeholders or replace them with meaningful content.');
  }

  for (const scope of config.nonPlaceholderTestScopes || []) {
    const scoped = visible.filter((f) => f.startsWith(scope.replace(/\/$/, '') + '/') && /\.test\.[cm]?[jt]s$/.test(f));
    const bad = scoped.filter((f) => {
      const text = readText(root, f);
      const hasTest = /\b(?:test|it)\s*\(/.test(text);
      const hasAssertion = /\b(?:assert(?:\.|\s*\()|expect\s*\()/.test(text);
      return text.trim().length < 80 || !hasTest || !hasAssertion;
    });
    add(
      checks,
      `tests.non_placeholder:${scope}`,
      bad.length === 0,
      bad,
      'Generated scaffolds are not evidence. Replace placeholders only through the repository\'s authorized human workflow.'
    );
  }
}

function requirementsChecks(root, files, config, checks) {
  const req = config.requirements;
  if (!req) return;
  const sourceSpecs = Array.isArray(req.source) ? req.source : [req.source];
  const sourceMatches = resolveFileSpecs(root, files, sourceSpecs);
  const source = sourceMatches[0] || sourceSpecs.find(Boolean);
  if (!source || !relExists(root, source)) {
    if (req.optional) {
      add(checks, 'requirements.source', true, { skipped: true, source: source || null });
      return;
    }
    add(checks, 'requirements.source', false, source || null, 'Configure an existing requirements source file.');
    return;
  }
  const text = readText(root, source);

  for (const heading of req.requiredMarkdownHeadings || []) {
    add(
      checks,
      `requirements.heading:${heading}`,
      lineHasHeading(text, heading),
      source,
      `Use a Markdown heading such as "## ${heading}" so parsers do not treat it as ordinary prose.`
    );
  }

  const ids = extractMarkdownTableRequirementIds(text, req.requirementIdPattern);
  if (req.rejectDuplicateRequirementRows !== false) {
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
    add(checks, 'requirements.unique_rows', dupes.length === 0, dupes, 'Keep each requirement ID in exactly one requirement row.');
  }

  const traceSpecs = req.traceFiles || [];
  if (traceSpecs.length) {
    const traceFiles = resolveFileSpecs(root, files, traceSpecs);
    const existingTraceTexts = traceFiles.map((f) => ({ file: f, text: readText(root, f) }));
    const missing = [...new Set(ids)].filter((id) => !existingTraceTexts.some((x) => x.text.includes(id)));
    add(
      checks,
      'requirements.acceptance_trace',
      missing.length === 0,
      { missing_ids: missing, trace_files: traceFiles },
      'Add genuine acceptance-test trace identification; do not create empty tests only to satisfy coverage.'
    );
  }
}

function formalChecks(root, files, config, checks) {
  const formal = config.formal;
  if (!formal) return;
  const manifestSpecs = Array.isArray(formal.manifest) ? formal.manifest : [formal.manifest];
  const modelSpecs = Array.isArray(formal.model) ? formal.model : [formal.model];
  const manifestPath = resolveFileSpecs(root, files, manifestSpecs)[0] || manifestSpecs.find(Boolean);
  const modelPath = resolveFileSpecs(root, files, modelSpecs)[0] || modelSpecs.find(Boolean);
  const manifestExists = Boolean(manifestPath && relExists(root, manifestPath));
  const modelExists = Boolean(modelPath && relExists(root, modelPath));

  if (formal.optional && !manifestExists && !modelExists) {
    add(checks, 'formal.optional', true, { skipped: true, reason: 'no formal manifest/model present' });
    return;
  }

  let manifest = null;
  let manifestText = '';
  if (!manifestPath || !manifestExists) {
    add(checks, 'formal.manifest', false, manifestPath || null, 'Configure the durable formal manifest path.');
  } else {
    try {
      manifestText = readText(root, manifestPath);
      manifest = JSON.parse(manifestText);
      add(checks, 'formal.manifest', true, manifestPath);
    } catch (error) {
      add(checks, 'formal.manifest', false, String(error?.message || error), 'Manifest must be valid JSON.');
    }
  }

  const modelText = modelExists ? readText(root, modelPath) : '';
  if (modelPath) add(checks, 'formal.model', modelText.length > 0, modelPath, 'Configure the existing TLA+/formal model path.');

  for (const state of formal.requiredStates || []) {
    const inManifest = manifestText.includes(state);
    const inModel = modelText.includes(state);
    add(
      checks,
      `formal.state:${state}`,
      inManifest && inModel,
      { manifest: inManifest, model: inModel },
      'Required states must be represented in both manifest and model.'
    );
  }

  if (manifest) {
    for (const property of formal.requiredProperties || []) {
      const found = findNamedObject(manifest, property.name);
      const kindOk = found?.kind === 'invariant';
      const body = found ? JSON.stringify(found) : '';
      const missingRequirements = (property.requirements || []).filter((id) => !body.includes(id));
      add(
        checks,
        `formal.property:${property.name}`,
        Boolean(found) && kindOk && missingRequirements.length === 0,
        { found: Boolean(found), kind: found?.kind ?? null, missing_requirements: missingRequirements },
        'Every required property must exist, use kind "invariant", and carry its configured requirement coverage.'
      );
    }
  }

  for (const binding of formal.traceBindings || []) {
    const matchedFiles = resolveFileSpecs(root, files, [binding.file]);
    const text = matchedFiles.map((file) => readText(root, file)).join('\n');
    const missing = (binding.requirements || []).filter((id) => !text.includes(id));
    add(
      checks,
      `formal.trace:${binding.file}`,
      matchedFiles.length > 0 && missing.length === 0,
      { matched_files: matchedFiles, missing_requirements: missing },
      'Identify the real requirement IDs in the invariant/audit test that enforces them.'
    );
  }
}

function purposeChecks(root, files, config, checks) {
  const purpose = config.purpose;
  if (!purpose) return;
  const inventoryPath = purpose.inventory;
  if (!inventoryPath || !relExists(root, inventoryPath)) {
    add(checks, 'purpose.inventory', false, inventoryPath || null, 'Configure the repository purpose inventory.');
    return;
  }

  let inventory;
  try {
    inventory = readJson(path.join(root, inventoryPath));
  } catch (error) {
    add(checks, 'purpose.inventory', false, String(error?.message || error), 'Inventory must be valid JSON.');
    return;
  }

  const entries = inventory.paths || {};
  const ignores = [...DEFAULT_IGNORES, ...(config.ignore || []), ...(purpose.ignore || [])];
  const visible = files.filter((f) => !matchesAny(f, ignores));
  const generated = purpose.generated || [];
  const missing = visible.filter((f) => f !== inventoryPath && !matchesAny(f, generated) && !entries[f]);
  const orphaned = Object.keys(entries).filter((f) => !files.includes(f) && !matchesAny(f, generated));

  add(
    checks,
    'purpose.coverage',
    missing.length === 0,
    {
      missing,
      suggested_entries: Object.fromEntries(missing.map((f) => [f, { purpose: 'TODO: explain durable purpose before finalizing' }]))
    },
    'Add only durable paths with a real purpose. Delete temporary repair tooling instead of blessing it.'
  );
  add(checks, 'purpose.no_orphans', orphaned.length === 0, orphaned, 'Remove stale inventory entries when durable paths are deleted.');
}

export function runDoctor({ root = findRepoRoot(), configPath = null } = {}) {
  const effectiveConfigPath = configPath ? path.resolve(root, configPath) : path.join(root, '.engineering-doctor.json');
  let config = { version: 1 };
  let configLoaded = false;
  if (fs.existsSync(effectiveConfigPath)) {
    config = readJson(effectiveConfigPath);
    configLoaded = true;
  }

  const files = listFiles(root);
  const checks = [];
  add(
    checks,
    'config.loaded',
    configLoaded || config.allowUnconfigured === true,
    configLoaded ? posix(path.relative(root, effectiveConfigPath)) : null,
    'Add .engineering-doctor.json to opt in this repository and make expectations explicit.'
  );
  universalChecks(root, files, config, checks);
  requirementsChecks(root, files, config, checks);
  formalChecks(root, files, config, checks);
  purposeChecks(root, files, config, checks);

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    root,
    config: configLoaded ? posix(path.relative(root, effectiveConfigPath)) : null,
    checks,
    failed,
  };
}

function printHuman(report) {
  process.stdout.write(`engineering-doctor · ${report.root}\n`);
  for (const check of report.checks) {
    const mark = check.ok ? 'PASS' : 'FAIL';
    process.stdout.write(`${mark} ${check.id}\n`);
    if (!check.ok) {
      process.stdout.write(`  detail: ${JSON.stringify(check.detail)}\n`);
      if (check.remediation) process.stdout.write(`  next:   ${check.remediation}\n`);
    }
  }
  process.stdout.write(report.ok ? 'READY: no doctor blockers\n' : `BLOCKED: ${report.failed.length} doctor check(s) failed\n`);
}

export function main(args = process.argv.slice(2)) {
  const json = args.includes('--json');
  const configIndex = args.indexOf('--config');
  const configPath = configIndex >= 0 ? args[configIndex + 1] : null;
  try {
    const report = runDoctor({ configPath });
    if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else printHuman(report);
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = String(error?.stack || error?.message || error);
    if (json) process.stdout.write(JSON.stringify({ ok: false, fatal: message }, null, 2) + '\n');
    else process.stderr.write(`engineering-doctor fatal: ${message}\n`);
    return 2;
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exitCode = main();
