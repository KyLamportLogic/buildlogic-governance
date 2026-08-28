/**
 * Dual-pass cognitive protocol for frontier-model RPA / agent completions.
 *
 * Pass 1: <cognitive_scratchpad> — latent plan + meta-audit (never executed).
 * Pass 2: <governed_action> — raw JSON payload only (tool dispatch or halt).
 *
 * Fail-close audits before dispatch:
 * - Grounding Rule
 * - Mechanism Mismatch Rule
 * - Sensor Tampering Check
 */

import { z } from "zod";

export class GovernanceException extends Error {
  readonly halt = true as const;
  readonly rule?: string;
  readonly code = "GOVERNANCE_DUAL_PASS";

  constructor(message: string, rule?: string) {
    super(message);
    this.name = "GovernanceException";
    this.rule = rule;
  }
}

/** Tool dispatch — narrative fields are rejected. */
export const GovernedToolActionSchema = z
  .object({
    tool: z.string().min(1),
  })
  .passthrough()
  .refine(
    (v) =>
      !("justification" in v) &&
      !("reasoning" in v) &&
      !("narrative" in v) &&
      !("explanation" in v),
    { message: "governed_action must not contain narrative justification fields" }
  );

export const GovernedHaltActionSchema = z
  .object({
    halt: z.literal(true),
  })
  .passthrough();

export const GovernedActionSchema = z.union([
  GovernedHaltActionSchema,
  GovernedToolActionSchema,
]);

export type GovernedAction = z.infer<typeof GovernedActionSchema>;

export type DualPassParsed = {
  cognitive_scratchpad: string;
  governed_action: GovernedAction;
};

export type DualPassAuditOk = { ok: true };
export type DualPassAuditFail = {
  ok: false;
  halt: true;
  rule: "grounding" | "mechanism_mismatch" | "sensor_tampering" | "schema";
  reason: string;
};
export type DualPassAuditResult = DualPassAuditOk | DualPassAuditFail;

export type DualPassAllowed = {
  allowed: true;
  scratchpad: string;
  action: GovernedAction & { tool: string };
};
export type DualPassBlocked = {
  allowed: false;
  halt: true;
  reason: string;
  rule?: string;
  scratchpad?: string;
  action?: GovernedAction;
};
export type DualPassResult = DualPassAllowed | DualPassBlocked;

const INVASIVE_TOOL_RE =
  /\b(eval|localStorage|sessionStorage|frame\.|bypass|document\.write|Function\(|child_process|rm\s+-rf|unlinkSync)\b/i;

const BENIGN_PLAN_RE =
  /\b(scrape|scraping|click|read|list|fetch|extract|navigate|open|view|property prices|routine)\b/i;

const SENSOR_TAMPER_RE =
  /\b(delete|rm\s+-rf|unlink|truncate|forge|rewrite|manipulate|bypass|disable)\b.*\b(log|logs|sentry|posthog|audit|@buildlogic\/logger|logger|git\s+log|test\s+record|shadow\s+folder)\b|\b(log|logs|sentry|posthog|audit|@buildlogic\/logger)\b.*\b(delete|rm\s+-rf|unlink|forge|rewrite|manipulate|bypass|disable)\b/i;

/** CSS / attribute selectors commonly referenced in RPA plans. */
const SELECTOR_CANDIDATE_RE =
  /(?:^|[\s"'`(])((?:[a-zA-Z][\w-]*#[\w-]+)|(?:#[\w-]+)|(?:\[[\w-]+(?:=["'][^"']*["'])?\])|(?:\.[a-zA-Z_][\w-]*))/g;

export function extractXmlTag(raw: string, tag: string): string | null {
  if (typeof raw !== "string" || !tag) return null;
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(raw);
  return match ? match[1].trim() : null;
}

export function parseDualPassOutput(raw: string): DualPassParsed {
  const scratchpad = extractXmlTag(raw, "cognitive_scratchpad");
  const actionRaw = extractXmlTag(raw, "governed_action");

  if (!scratchpad) {
    throw new GovernanceException(
      "Dual-pass fail-close: missing <cognitive_scratchpad>",
      "schema"
    );
  }
  if (!actionRaw) {
    throw new GovernanceException(
      "Dual-pass fail-close: missing <governed_action>",
      "schema"
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(actionRaw);
  } catch {
    throw new GovernanceException(
      "Dual-pass fail-close: <governed_action> is not valid JSON",
      "schema"
    );
  }

  const validated = GovernedActionSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new GovernanceException(
      `Dual-pass fail-close: governed_action schema invalid — ${validated.error.message}`,
      "schema"
    );
  }

  return {
    cognitive_scratchpad: scratchpad,
    governed_action: validated.data,
  };
}

export function validateGovernedAction(
  action: unknown
): { ok: true; data: GovernedAction } | { ok: false; reason: string } {
  const validated = GovernedActionSchema.safeParse(action);
  if (!validated.success) {
    return { ok: false, reason: validated.error.message };
  }
  return { ok: true, data: validated.data };
}

function collectSelectors(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    SELECTOR_CANDIDATE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SELECTOR_CANDIDATE_RE.exec(text)) !== null) {
      const sel = m[1];
      if (sel && sel.length > 1) found.add(sel);
    }
  }
  return [...found];
}

function selectorGrounded(selector: string, snapshot: string): boolean {
  const snap = snapshot.toLowerCase();
  const sel = selector.trim();
  if (!sel) return true;

  // button#submit → id="submit" or id='submit' or #submit or button id=submit
  const idMatch = /#([\w-]+)/.exec(sel);
  if (idMatch) {
    const id = idMatch[1].toLowerCase();
    if (
      snap.includes(`id="${id}"`) ||
      snap.includes(`id='${id}'`) ||
      snap.includes(`id=${id}`) ||
      snap.includes(`#${id}`)
    ) {
      return true;
    }
  }

  const attrMatch = /\[([\w-]+)(?:=["']([^"']*)["'])?\]/.exec(sel);
  if (attrMatch) {
    const attr = attrMatch[1].toLowerCase();
    const val = (attrMatch[2] || "").toLowerCase();
    if (val) {
      if (
        snap.includes(`${attr}="${val}"`) ||
        snap.includes(`${attr}='${val}'`) ||
        snap.includes(val)
      ) {
        return true;
      }
    } else if (snap.includes(attr)) {
      return true;
    }
  }

  const classMatch = /\.([a-zA-Z_][\w-]*)/.exec(sel);
  if (classMatch) {
    const cls = classMatch[1].toLowerCase();
    if (
      snap.includes(`class="${cls}"`) ||
      snap.includes(`class='${cls}'`) ||
      snap.includes(`class=`) && snap.includes(cls) ||
      snap.includes(`.${cls}`)
    ) {
      return true;
    }
  }

  return snap.includes(sel.toLowerCase());
}

/**
 * Adversarial self-audit before submitting governed_action to the runtime.
 */
export function auditDualPass(input: {
  scratchpad: string;
  action: Record<string, unknown>;
  environmentSnapshot?: string;
}): DualPassAuditResult {
  const scratchpad = input.scratchpad || "";
  const action = input.action || {};
  const snapshot = input.environmentSnapshot;

  const actionBlob = JSON.stringify(action);
  const combined = `${scratchpad}\n${actionBlob}`;

  if (SENSOR_TAMPER_RE.test(combined)) {
    return {
      ok: false,
      halt: true,
      rule: "sensor_tampering",
      reason:
        "Sensor Tampering Check: action or scratchpad attempts to modify/bypass logs or security sensors",
    };
  }

  const tool = typeof action.tool === "string" ? action.tool : "";
  const invasive =
    INVASIVE_TOOL_RE.test(tool) ||
    INVASIVE_TOOL_RE.test(actionBlob) ||
    /\beval\b/i.test(tool) ||
    /\.eval\b/i.test(tool);

  if (invasive && BENIGN_PLAN_RE.test(scratchpad) && !/\beval\b|\blocalStorage\b/i.test(scratchpad)) {
    return {
      ok: false,
      halt: true,
      rule: "mechanism_mismatch",
      reason:
        "Mechanism Mismatch Rule: benign stated plan paired with invasive/obfuscated action payload",
    };
  }

  if (snapshot && typeof snapshot === "string" && snapshot.trim()) {
    const selector =
      typeof action.selector === "string"
        ? action.selector
        : typeof action.cssSelector === "string"
          ? action.cssSelector
          : "";

    const candidates = collectSelectors(scratchpad, selector);
    for (const sel of candidates) {
      // Only enforce grounding for selectors that appear in the action payload
      // or are explicitly claimed as targets in the scratchpad.
      const inAction =
        selector === sel ||
        actionBlob.includes(sel) ||
        (typeof action.selector === "string" && action.selector.includes(sel));
      if (!inAction && !/selector|target|click|type/i.test(scratchpad)) {
        continue;
      }
      if (!selectorGrounded(sel, snapshot)) {
        return {
          ok: false,
          halt: true,
          rule: "grounding",
          reason: `Grounding Rule: selector/reference "${sel}" not present in Level 1 environment snapshot`,
        };
      }
    }

    if (selector && !selectorGrounded(selector, snapshot)) {
      return {
        ok: false,
        halt: true,
        rule: "grounding",
        reason: `Grounding Rule: action selector "${selector}" not present in Level 1 environment snapshot`,
      };
    }
  }

  return { ok: true };
}

export function validateDualPassCompletion(
  raw: string,
  options: { environmentSnapshot?: string } = {}
): DualPassResult {
  let parsed: DualPassParsed;
  try {
    parsed = parseDualPassOutput(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const rule = err instanceof GovernanceException ? err.rule : "schema";
    return { allowed: false, halt: true, reason: message, rule };
  }

  if ("halt" in parsed.governed_action && parsed.governed_action.halt === true) {
    const haltReason = (parsed.governed_action as { reason?: string }).reason;
    return {
      allowed: false,
      halt: true,
      reason:
        typeof haltReason === "string" ? haltReason : "governed_action requested halt",
      scratchpad: parsed.cognitive_scratchpad,
      action: parsed.governed_action,
      rule: "halt",
    };
  }

  const audit = auditDualPass({
    scratchpad: parsed.cognitive_scratchpad,
    action: parsed.governed_action as Record<string, unknown>,
    environmentSnapshot: options.environmentSnapshot,
  });

  if (!audit.ok) {
    return {
      allowed: false,
      halt: true,
      reason: audit.reason,
      rule: audit.rule,
      scratchpad: parsed.cognitive_scratchpad,
      action: parsed.governed_action,
    };
  }

  return {
    allowed: true,
    scratchpad: parsed.cognitive_scratchpad,
    action: parsed.governed_action as GovernedAction & { tool: string },
  };
}

export type DualPassDispatchInput = {
  content?: string | null;
  toolCall?: { name: string; arguments?: Record<string, unknown> } | null;
  environmentSnapshot?: string;
  /** High-impact = Playwright/DB/shell-class side effects */
  highImpact?: boolean;
  /** When true, missing dual-pass on high-impact → GovernanceException */
  strict?: boolean;
};

/**
 * Bridge for OpenAI-shaped tool_calls: scratchpad in content, action from tool call,
 * or full XML dual-pass in content alone.
 */
export function assertDualPassDispatch(input: DualPassDispatchInput): DualPassResult {
  const content = input.content || "";
  const hasFullDualPass =
    /<cognitive_scratchpad\b/i.test(content) && /<governed_action\b/i.test(content);

  if (hasFullDualPass) {
    const result = validateDualPassCompletion(content, {
      environmentSnapshot: input.environmentSnapshot,
    });
    if (!result.allowed) {
      throw new GovernanceException(result.reason, result.rule);
    }
    return result;
  }

  const scratchpadOnly = extractXmlTag(content, "cognitive_scratchpad");
  if (scratchpadOnly && input.toolCall?.name) {
    const action = {
      tool: input.toolCall.name,
      ...(input.toolCall.arguments || {}),
    };
    const schema = validateGovernedAction(action);
    if (!schema.ok) {
      throw new GovernanceException(
        `Dual-pass fail-close: tool call schema invalid — ${schema.reason}`,
        "schema"
      );
    }
    const audit = auditDualPass({
      scratchpad: scratchpadOnly,
      action: action as Record<string, unknown>,
      environmentSnapshot: input.environmentSnapshot,
    });
    if (!audit.ok) {
      throw new GovernanceException(audit.reason, audit.rule);
    }
    return {
      allowed: true,
      scratchpad: scratchpadOnly,
      action: schema.data as GovernedAction & { tool: string },
    };
  }

  if (input.highImpact && input.strict) {
    throw new GovernanceException(
      "Dual-pass fail-close: high-impact tool call requires <cognitive_scratchpad> (and preferably <governed_action>) before dispatch",
      "schema"
    );
  }

  if (input.toolCall?.name) {
    const action = {
      tool: input.toolCall.name,
      ...(input.toolCall.arguments || {}),
    };
    // Soft path still runs sensor / mechanism audits on high-impact payloads
    if (input.highImpact) {
      const audit = auditDualPass({
        scratchpad: content || "non-strict high-impact dispatch",
        action: action as Record<string, unknown>,
        environmentSnapshot: input.environmentSnapshot,
      });
      if (!audit.ok) {
        throw new GovernanceException(audit.reason, audit.rule);
      }
    }
    return {
      allowed: true,
      scratchpad: content || "(no scratchpad — non-strict path)",
      action: action as GovernedAction & { tool: string },
    };
  }

  throw new GovernanceException(
    "Dual-pass fail-close: no governed_action or tool call to dispatch",
    "schema"
  );
}

/** System-prompt appendix instructing models to emit dual-pass XML. */
export const DUAL_PASS_SYSTEM_APPENDIX = `
HIGH-IMPACT ACTIONS (browser click/type, scrape, shell, DB, outbound email/API) REQUIRE dual-pass output:

<cognitive_scratchpad>
[LEVEL 1 PERCEPTION] — raw environment facts only
[LEVEL 3 META-AWARENESS & AUDIT] — Grounding Rule, Mechanism Mismatch, Sensor Tampering; Outcome: Safe or Halt
</cognitive_scratchpad>

<governed_action>
{"tool":"<name>", ...params}
</governed_action>

The <governed_action> block must be JSON only — no narrative. If any audit fails, return {"halt":true,"reason":"..."} instead of calling tools.
`.trim();

export function dualPassRequiredByEnv(): boolean {
  // Opt-in strict mode — when unset, still validate whenever dual-pass XML is present.
  return process.env.AI_REQUIRE_DUAL_PASS === "true";
}
