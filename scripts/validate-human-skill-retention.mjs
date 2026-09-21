import fs from "node:fs";

const MARKER = "HUMAN_SKILL_RETENTION_GATE";
const EXPECTED_FORMULA = "TaskGate = 1 if C = ∅ else min_{c∈C}(H_c * J_c * E_c * (1 - A_c))";
const EXPECTED_SKILL_COUNT = 23;
const cfgPath = "config/human-skill-retention.json";
const errors = [];

if (!fs.existsSync(cfgPath)) {
  errors.push(`missing ${cfgPath}`);
} else {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (cfg.marker !== MARKER) errors.push("marker mismatch");
  if (cfg.formula !== EXPECTED_FORMULA) errors.push("formula mismatch");
  if (cfg.passCondition !== "TaskGate = 1") errors.push("passCondition mismatch");
  if (!Array.isArray(cfg.protectedCapabilities) || cfg.protectedCapabilities.length !== EXPECTED_SKILL_COUNT) {
    errors.push(`protectedCapabilities must contain exactly ${EXPECTED_SKILL_COUNT} entries`);
  } else {
    const ids = new Set();
    for (const c of cfg.protectedCapabilities) {
      if (!c?.id || ids.has(c.id)) errors.push("protected capability IDs must be unique and non-empty");
      ids.add(c.id);
      if (c.humanFirstPassRequired !== true) errors.push(`${c.id}: humanFirstPassRequired must be true`);
      if (c.humanFinalJudgmentRequired !== true) errors.push(`${c.id}: humanFinalJudgmentRequired must be true`);
      if (c.evidenceRequired !== true) errors.push(`${c.id}: evidenceRequired must be true`);
      if (c.aiMayBeFinalAuthority !== false) errors.push(`${c.id}: aiMayBeFinalAuthority must be false`);
    }
  }

  for (const surface of cfg.requiredSurfaces ?? []) {
    if (!fs.existsSync(surface)) {
      errors.push(`missing required agent surface: ${surface}`);
      continue;
    }
    const text = fs.readFileSync(surface, "utf8");
    if (!text.includes(MARKER)) errors.push(`${surface}: missing ${MARKER}`);
  }
}

const score = errors.length === 0 ? 1 : 0;
console.log(`HumanSkillRetentionPolicyScore=${score.toFixed(1)}`);
if (errors.length) {
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
