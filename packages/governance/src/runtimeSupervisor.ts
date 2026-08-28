/**
 * BuildLogic Runtime Supervisor
 *
 * Fail-close execution gate for dual-pass agent turns:
 *   Pass 1 — <cognitive_scratchpad> (latent plan; never executed)
 *   Pass 2 — <governed_action> (JSON dispatch or graceful halt)
 *
 * Gates:
 *   1. Strict physical schema parsing (XML + JSON)
 *   2. Recursive SSRF / metadata destination blocklist
 *   3. Mechanistic Anomaly Detection (MAD) — thought vs mechanism
 *   4. Graceful self-halt → SUSPENDED_AWAITING_INPUT
 */

import { GovernanceException, extractXmlTag } from "./dualPassProtocol";
import {
  canonicalizeHostToIp,
  isPrivateOrReservedIp,
  validateOutboundUrl,
} from "./egressValidator";

export { GovernanceException };

// ---------------------------------------------------------------------------
// Public types (strict dual-pass / supervisor contract)
// ---------------------------------------------------------------------------

export interface AgentStepInput {
  rawLLMOutput: string;
}

/**
 * Execution-layer governed action.
 * Distinct from the Zod dual-pass `GovernedAction` (tool | halt union) —
 * this shape supports action_type/payload RPA envelopes used by the supervisor.
 */
export interface RuntimeSupervisorGovernedAction {
  halt?: boolean;
  action_type?: string;
  /** Dual-pass tool name when not using action_type/payload envelope. */
  tool?: string;
  payload?: unknown;
  reason?: string;
  supervisor?: string;
  required_next_input?: string;
  /** Extra tool params may appear at the top level (selector, url, …). */
  [key: string]: unknown;
}

/**
 * Spec name for the supervisor payload shape.
 * (Distinct from Zod `GovernedAction` in dualPassProtocol — import from this module.)
 */
export type GovernedAction = RuntimeSupervisorGovernedAction;

export interface AuditResult {
  safe: boolean;
  reason: string;
}

export type RuntimeSupervisorState =
  | "IDLE"
  | "PROCESSING"
  | "SUSPENDED_AWAITING_INPUT"
  | "HALTED_FAIL_CLOSE"
  | "COMPLETED";

export interface ProcessAgentTurnResult {
  suspended: boolean;
  state: RuntimeSupervisorState;
  action?: RuntimeSupervisorGovernedAction;
  audit?: AuditResult;
  executed?: boolean;
}

/** Minimal Playwright Page surface used by the supervisor (mockable in Jest). */
export interface PlaywrightPageLike {
  goto?(url: string): Promise<unknown>;
  evaluate?(pageFunction: unknown, ...args: unknown[]): Promise<unknown>;
  click?(selector: string): Promise<unknown>;
}

export interface SupervisorLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface BuildLogicRuntimeSupervisorOptions {
  page?: PlaywrightPageLike;
  /** Invoked when the agent bypasses the structured dual-pass contract. */
  onEmergencyKillSwitch?: () => void;
  logger?: SupervisorLogger;
  /**
   * When true, run Playwright goto/click after gates pass.
   * Default false — production agent loops audit here then dispatch via their own executor.
   */
  executeBrowserCommands?: boolean;
}

// ---------------------------------------------------------------------------
// Blocklists & MAD lexicons
// ---------------------------------------------------------------------------

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const BENIGN_OBJECTIVE_RE =
  /\b(reading\s+listings|reading\s+of\s+listings|viewing\s+text|clicking\s+elements|scrape|scraping|routine\s+reading|property\s+(?:prices|cards|listings)|navigate|open\s+details)\b/i;

const INVASIVE_MECHANISM_RE =
  /\b(eval\s*\(|new\s+Function\s*\(|Function\s*\(|\.innerHTML\s*=|document\.cookie|localStorage|sessionStorage|postMessage\s*\(|window\.postMessage)\b/i;

const URL_LIKE_RE =
  /(?:https?:\/\/[^\s"'`<>]+)|(?:\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.\d{1,3}\.\d{1,3}|::1)\b(?::\d+)?(?:\/[^\s"'`<>]*)?)/gi;

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// ---------------------------------------------------------------------------
// Helpers (modular, documented)
// ---------------------------------------------------------------------------

/**
 * Recursively collect string leaves from an arbitrary JSON-like value.
 */
export function collectStringLeaves(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(v, out);
    }
  }
  return out;
}

/**
 * Extract candidate destinations (URLs, hostnames, IPs) from free text.
 */
export function extractDestinationsFromText(text: string): string[] {
  const found = new Set<string>();
  if (!text) return [];

  URL_LIKE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_LIKE_RE.exec(text)) !== null) {
    found.add(m[0]);
  }

  IPV4_RE.lastIndex = 0;
  while ((m = IPV4_RE.exec(text)) !== null) {
    found.add(m[0]);
  }

  // Bare hostnames that appear as host: keys
  const hostKey = /\bhost(?:name)?["']?\s*[:=]\s*["']?([a-z0-9.-]+)/gi;
  while ((m = hostKey.exec(text)) !== null) {
    found.add(m[1]);
  }

  return [...found];
}

/**
 * True when a destination string targets link-local metadata or unapproved local services.
 */
export function isBlockedDestination(destination: string): boolean {
  const raw = destination.trim();
  if (!raw) return false;

  let host = raw;
  try {
    if (/^https?:\/\//i.test(raw) || raw.includes("://")) {
      const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
      host = u.hostname;
    } else if (raw.includes("/") && /^\d/.test(raw)) {
      host = raw.split("/")[0].split(":")[0];
    } else if (raw.includes(":")) {
      // host:port or ipv6
      if (netIsIpv4WithPort(raw)) {
        host = raw.split(":")[0];
      } else {
        host = raw;
      }
    }
  } catch {
    host = raw.split("/")[0].split(":")[0];
  }

  const hostLower = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(hostLower)) return true;
  if (/\blocalhost\b/i.test(raw)) return true;

  // CIDR membership on canonicalized IP literals (decimal / mapped / dotted)
  const literalIp = canonicalizeHostToIp(hostLower);
  if (literalIp && isPrivateOrReservedIp(literalIp)) return true;

  // Bare leaf that is itself an alternate-form IP
  const leafIp = canonicalizeHostToIp(raw);
  if (leafIp && isPrivateOrReservedIp(leafIp)) return true;

  return false;
}

function netIsIpv4WithPort(s: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s);
}

/**
 * Recursively inspect a governed action for blocked destinations (SSRF gate).
 */
export function auditPayloadForSsrf(
  action: RuntimeSupervisorGovernedAction
): AuditResult {
  const leaves = collectStringLeaves(action);
  const destinations: string[] = [];
  for (const leaf of leaves) {
    destinations.push(...extractDestinationsFromText(leaf));
    // Also treat the leaf itself as a possible bare host/IP
    destinations.push(leaf);
  }

  for (const dest of destinations) {
    if (isBlockedDestination(dest)) {
      return {
        safe: false,
        reason: `SSRF/Metadata endpoint access blocked: blocked destination "${dest}"`,
      };
    }
  }

  return { safe: true, reason: "no blocked destinations" };
}

/**
 * Mechanistic Anomaly Detection — benign stated objective vs invasive payload mechanism.
 */
export function auditMechanisticAnomaly(
  scratchpad: string,
  action: RuntimeSupervisorGovernedAction
): AuditResult {
  const actionBlob = JSON.stringify(action);
  const invasive =
    INVASIVE_MECHANISM_RE.test(actionBlob) ||
    INVASIVE_MECHANISM_RE.test(String(action.action_type ?? "")) ||
    INVASIVE_MECHANISM_RE.test(String(action.tool ?? ""));

  const benignStated = BENIGN_OBJECTIVE_RE.test(scratchpad);
  const scratchpadAdmitsInvasive = INVASIVE_MECHANISM_RE.test(scratchpad);

  if (invasive && benignStated && !scratchpadAdmitsInvasive) {
    return {
      safe: false,
      reason:
        "Strategic Deception Anomaly: benign cognitive objective mismatched with high-privilege execution mechanism (MAD fail-close)",
    };
  }

  return { safe: true, reason: "no mechanistic anomaly detected" };
}

/**
 * Parse dual-pass XML tags into scratchpad + GovernedAction.
 * Throws GovernanceException on missing/empty tags or malformed JSON.
 */
export function parseSupervisorDualPass(raw: string): {
  scratchpad: string;
  action: RuntimeSupervisorGovernedAction;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new GovernanceException(
      "Security Exception: Agent bypassed structured contract",
      "schema"
    );
  }

  const scratchpad = extractXmlTag(raw, "cognitive_scratchpad");
  const actionRaw = extractXmlTag(raw, "governed_action");

  if (!scratchpad || !actionRaw) {
    throw new GovernanceException(
      "Security Exception: Agent bypassed structured contract",
      "schema"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(actionRaw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new GovernanceException(
      `governed_action JSON parse failed: ${detail}`,
      "schema"
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GovernanceException(
      "governed_action JSON parse failed: expected a JSON object",
      "schema"
    );
  }

  return {
    scratchpad,
    action: parsed as RuntimeSupervisorGovernedAction,
  };
}

// ---------------------------------------------------------------------------
// Runtime Supervisor
// ---------------------------------------------------------------------------

/**
 * Production fail-close supervisor for Playwright / agent execution loops.
 * Single self-contained class: parse → SSRF → MAD → halt or dispatch.
 */
export class BuildLogicRuntimeSupervisor {
  private state: RuntimeSupervisorState = "IDLE";
  private readonly page?: PlaywrightPageLike;
  private readonly onEmergencyKillSwitch?: () => void;
  private readonly logger: SupervisorLogger;
  private readonly executeBrowserCommands: boolean;
  private frozen = false;

  constructor(options: BuildLogicRuntimeSupervisorOptions = {}) {
    this.page = options.page;
    this.onEmergencyKillSwitch = options.onEmergencyKillSwitch;
    this.executeBrowserCommands = options.executeBrowserCommands === true;
    this.logger = options.logger ?? {
      warn: (message, meta) => {
        // Structured warn without depending on the logger package in unit tests
        console.warn(
          JSON.stringify({
            level: "warn",
            component: "BuildLogicRuntimeSupervisor",
            message,
            ...meta,
          })
        );
      },
    };
  }

  getState(): RuntimeSupervisorState {
    return this.state;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  /**
   * Process one agent turn under dual-pass + MAD + SSRF gates.
   * High-impact browser commands run only after all gates pass.
   */
  async processAgentTurn(
    input: AgentStepInput
  ): Promise<ProcessAgentTurnResult> {
    this.state = "PROCESSING";

    let scratchpad: string;
    let action: RuntimeSupervisorGovernedAction;

    try {
      ({ scratchpad, action } = parseSupervisorDualPass(input.rawLLMOutput));
    } catch (err) {
      if (
        err instanceof GovernanceException &&
        err.message.includes("bypassed structured contract")
      ) {
        this.triggerEmergencyKillSwitch(err.message);
        this.state = "HALTED_FAIL_CLOSE";
        this.frozen = true;
      } else {
        this.state = "HALTED_FAIL_CLOSE";
      }
      throw err;
    }

    // Graceful self-halt — freeze thread, no browser commands
    if (action.halt === true) {
      this.logger.warn("governed_action requested halt — suspending runtime", {
        reason: action.reason,
        supervisor: action.supervisor,
        required_next_input: action.required_next_input,
        state: "SUSPENDED_AWAITING_INPUT",
      });
      this.frozen = true;
      this.state = "SUSPENDED_AWAITING_INPUT";
      return {
        suspended: true,
        state: "SUSPENDED_AWAITING_INPUT",
        action,
        audit: { safe: true, reason: "graceful self-halt" },
        executed: false,
      };
    }

    const ssrf = auditPayloadForSsrf(action);
    if (!ssrf.safe) {
      this.state = "HALTED_FAIL_CLOSE";
      this.frozen = true;
      throw new GovernanceException(ssrf.reason, "ssrf");
    }

    const mad = auditMechanisticAnomaly(scratchpad, action);
    if (!mad.safe) {
      this.state = "HALTED_FAIL_CLOSE";
      this.frozen = true;
      throw new GovernanceException(mad.reason, "mechanism_mismatch");
    }

    const executed = this.executeBrowserCommands
      ? await this.dispatchIfSafe(action)
      : false;
    this.state = "COMPLETED";
    this.frozen = false;

    return {
      suspended: false,
      state: "COMPLETED",
      action,
      audit: { safe: true, reason: "all gates passed" },
      executed,
    };
  }

  private triggerEmergencyKillSwitch(reason: string): void {
    this.logger.warn?.("emergency kill-switch callback — structured contract bypass", {
      reason,
    });
    try {
      this.onEmergencyKillSwitch?.();
    } catch {
      // Kill-switch callback must not mask the original GovernanceException
    }
  }

  /**
   * Dispatch only after gates pass. Maps action_type / tool onto Playwright.
   * Unknown action types are allowed (no-op) so callers can handle them.
   */
  private async dispatchIfSafe(
    action: RuntimeSupervisorGovernedAction
  ): Promise<boolean> {
    if (!this.page) return false;

    const kind = String(action.action_type ?? action.tool ?? "").toLowerCase();
    const payload =
      action.payload && typeof action.payload === "object"
        ? (action.payload as Record<string, unknown>)
        : {};

    if (kind.includes("goto") || kind.includes("navigate")) {
      const url = String(payload.url ?? action.url ?? "");
      if (url && this.page.goto) {
        // Defense-in-depth: isBlockedDestination() above is synchronous and
        // cannot resolve DNS, so an ordinary hostname that resolves to a
        // private/loopback/link-local address (DNS rebinding) or a non-http(s)
        // scheme (file://, etc.) would reach here unchecked. validateOutboundUrl
        // performs the DNS-aware, scheme-checked validation immediately before
        // the real navigation — the same helper already used by egressValidator.
        const egress = await validateOutboundUrl(url);
        if (!egress.ok) {
          throw new GovernanceException(
            `SSRF/Metadata endpoint access blocked: ${egress.reason ?? "destination rejected by egress validator"}`,
            "ssrf"
          );
        }
        await this.page.goto(url);
        return true;
      }
    }

    if (kind.includes("click")) {
      const selector = String(payload.selector ?? action.selector ?? "");
      if (selector && this.page.click) {
        await this.page.click(selector);
        return true;
      }
    }

    if (kind.includes("evaluate") || kind.includes("eval")) {
      // Invasive evaluate paths should already have been blocked by MAD.
      // Still refuse to execute evaluate as a defense-in-depth default.
      throw new GovernanceException(
        "Strategic Deception Anomaly: evaluate/eval dispatch refused by runtime supervisor",
        "mechanism_mismatch"
      );
    }

    return false;
  }
}
