/**
 * R3 — Automated Kill Switches & Risk-Level Ceilings
 *
 * Env kill switch (`AI_ACTION_KILL_SWITCH`), optional HST token match, and
 * in-process ceilings (tokens, unauthorized tools, blocked file patterns).
 * Injection path can latch the env kill for subsequent preflight checks.
 *
 * Scope (under-promise): latch is process-local unless deploy propagates env;
 * “hard program-level exit” is only used where callers opt into exit handlers.
 */

import { checkKillSwitch, clearKillSwitchCache } from "../killSwitch";
import type { RiskCeilingCheckInput, RiskCeilingConfig, RiskCeilingResult, RiskCeilingState } from "./types";

export type ProcessExitHandler = (code: number) => never;

let exitHandler: ProcessExitHandler = (code) => process.exit(code);

/** Override process exit for testing. */
export function setProcessExitHandlerForTesting(handler: ProcessExitHandler): void {
  exitHandler = handler;
}

/** Restore default exit handler. */
export function resetProcessExitHandler(): void {
  exitHandler = (code) => process.exit(code);
}

const DEFAULT_CEILING: RiskCeilingConfig = {
  maxTokenBudget: 100_000,
  maxUnauthorizedToolCalls: 0,
  blockedFilePatterns: [
    /\.env$/i,
    /credentials\.json$/i,
    /\/\.git\/logs\//i,
    /\/\.git\/COMMIT_EDITMSG$/i,
  ],
  maxRiskLevel: 0.85,
};

let ceilingConfig: RiskCeilingConfig = { ...DEFAULT_CEILING };
const ceilingState: RiskCeilingState = {
  tokensConsumed: 0,
  unauthorizedToolCalls: 0,
  fileAccessAttempts: [],
};

/**
 * Load risk ceiling config from environment.
 */
export function loadRiskCeilingConfig(): RiskCeilingConfig {
  const maxTokenBudget = parseInt(process.env.AI_MAX_TOKEN_BUDGET || "100000", 10) || 100_000;
  const maxUnauthorizedToolCalls =
    parseInt(process.env.AI_MAX_UNAUTHORIZED_TOOL_CALLS || "0", 10) || 0;
  const maxRiskLevel = parseFloat(process.env.AI_MAX_RISK_LEVEL || "0.85") || 0.85;

  ceilingConfig = {
    ...DEFAULT_CEILING,
    maxTokenBudget,
    maxUnauthorizedToolCalls,
    maxRiskLevel,
  };
  return ceilingConfig;
}

/**
 * Validate HST (hardware security token) for global kill switch activation.
 * When AI_HST_TOKEN is set, kill switch requires matching AI_HST_KILL_TOKEN.
 */
export function validateHstKillSwitch(): RiskCeilingResult {
  const hstRequired = process.env.AI_HST_TOKEN;
  const hstKill = process.env.AI_HST_KILL_TOKEN;

  if (hstRequired && hstKill && hstRequired === hstKill) {
    return {
      tier: "R3",
      breached: true,
      breachType: "hst_kill",
      reason: "R3: HST-validated global kill switch activated",
      frozen: true,
    };
  }

  const killSwitch = checkKillSwitch();
  if (killSwitch.active) {
    return {
      tier: "R3",
      breached: true,
      breachType: "hst_kill",
      reason: killSwitch.reason ?? "R3: global kill switch active",
      frozen: true,
    };
  }

  return {
    tier: "R3",
    breached: false,
    frozen: false,
  };
}

/**
 * Check risk ceilings and update state. Fail-close on breach.
 */
export function checkRiskCeilings(input: RiskCeilingCheckInput = {}): RiskCeilingResult {
  const hstResult = validateHstKillSwitch();
  if (hstResult.breached) return hstResult;

  const config = ceilingConfig.maxTokenBudget ? ceilingConfig : loadRiskCeilingConfig();

  if (input.tokensDelta !== undefined) {
    ceilingState.tokensConsumed += input.tokensDelta;
    if (ceilingState.tokensConsumed > config.maxTokenBudget) {
      return breachResult("token_budget", `Token budget exceeded: ${ceilingState.tokensConsumed}/${config.maxTokenBudget}`);
    }
  }

  if (input.toolCall && !input.toolCall.authorized) {
    ceilingState.unauthorizedToolCalls += 1;
    if (ceilingState.unauthorizedToolCalls > config.maxUnauthorizedToolCalls) {
      return breachResult(
        "unauthorized_tool",
        `Unauthorized tool call '${input.toolCall.name}' (${ceilingState.unauthorizedToolCalls}/${config.maxUnauthorizedToolCalls})`
      );
    }
  }

  if (input.filePath) {
    ceilingState.fileAccessAttempts.push(input.filePath);
    for (const pattern of config.blockedFilePatterns) {
      if (pattern.test(input.filePath)) {
        return breachResult("file_access", `Blocked file access: ${input.filePath}`);
      }
    }
  }

  if (input.riskLevel !== undefined && input.riskLevel > config.maxRiskLevel) {
    return breachResult("risk_level", `Risk level ${input.riskLevel} exceeds ceiling ${config.maxRiskLevel}`);
  }

  return { tier: "R3", breached: false, frozen: false };
}

/**
 * Enforce risk ceilings; on breach triggers hard exit (process.exit(1)).
 */
export function enforceRiskCeilingsOrFreeze(input: RiskCeilingCheckInput = {}): RiskCeilingResult {
  const result = checkRiskCeilings(input);
  if (result.breached) {
    result.frozen = true;
    exitHandler(1);
  }
  return result;
}

/** Get current ceiling state (observability). */
export function getRiskCeilingState(): Readonly<RiskCeilingState> {
  return { ...ceilingState, fileAccessAttempts: [...ceilingState.fileAccessAttempts] };
}

/** Reset ceiling state (testing only). */
export function resetRiskCeilingState(): void {
  ceilingState.tokensConsumed = 0;
  ceilingState.unauthorizedToolCalls = 0;
  ceilingState.fileAccessAttempts.length = 0;
  ceilingConfig = { ...DEFAULT_CEILING };
}

/**
 * Activate global kill switch after R1 prompt-binding detects injection drift.
 * Clears kill-switch cache so subsequent checks fail-close immediately.
 */
export function triggerKillSwitchFromPromptInjection(reason: string): RiskCeilingResult {
  process.env.AI_ACTION_KILL_SWITCH = "true";
  clearKillSwitchCache();

  return {
    tier: "R3",
    breached: true,
    breachType: "prompt_injection_kill",
    reason: `R3: prompt injection kill switch — ${reason}`,
    frozen: true,
  };
}

function breachResult(
  breachType: NonNullable<RiskCeilingResult["breachType"]>,
  reason: string
): RiskCeilingResult {
  return {
    tier: "R3",
    breached: true,
    breachType,
    reason: `R3: ${reason}`,
    frozen: false,
  };
}
