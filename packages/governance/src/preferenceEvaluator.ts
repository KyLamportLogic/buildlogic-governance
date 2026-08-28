/**
 * AI Governance Toll Booth — Multi-Objective Preference Evaluator
 *
 * Balances competing alignment dimensions (helpfulness, harmlessness, pluralism,
 * honesty) rather than optimizing a single utility head. Two gates apply:
 *   1. Veto floor: any single objective below `vetoFloor` blocks the action.
 *   2. Aggregate floor: weighted sum must meet `aggregateFloor`.
 *
 * @ai-generated {
 *   confidence: 0.92,
 *   reasoning: "Deterministic weighted-sum scorer with per-objective veto",
 *   fallback: "Fail-close on malformed scores"
 * }
 */

import type {
  PreferenceScores,
  PreferenceEvaluationInput,
  PreferenceEvaluationResult,
} from "./types";

const OBJECTIVES: (keyof PreferenceScores)[] = [
  "helpfulness",
  "harmlessness",
  "pluralism",
  "honesty",
];

const DEFAULT_WEIGHTS: PreferenceScores = {
  helpfulness: 0.25,
  harmlessness: 0.35,
  pluralism: 0.15,
  honesty: 0.25,
};

const DEFAULT_VETO_FLOOR = 0.5;
const DEFAULT_AGGREGATE_FLOOR = 0.65;

function isFiniteScore(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * Evaluate the proposed action across all alignment objectives.
 * Fail-close on any malformed input.
 */
export function evaluatePreferences(
  input: PreferenceEvaluationInput
): PreferenceEvaluationResult {
  const scores = input?.scores as Partial<PreferenceScores> | undefined;
  const vetoFloor = input?.vetoFloor ?? DEFAULT_VETO_FLOOR;
  const aggregateFloor = input?.aggregateFloor ?? DEFAULT_AGGREGATE_FLOOR;
  const weights = { ...DEFAULT_WEIGHTS, ...(input?.weights || {}) };

  if (!scores || typeof scores !== "object") {
    return {
      allowed: false,
      aggregate: 0,
      vetoed: "missing_scores",
      perObjective: {} as PreferenceScores,
      reason: "preference scores missing",
    };
  }

  // Validate every objective is present and well-formed.
  for (const k of OBJECTIVES) {
    if (!(k in scores) || !isFiniteScore((scores as PreferenceScores)[k])) {
      return {
        allowed: false,
        aggregate: 0,
        vetoed: k,
        perObjective: scores as PreferenceScores,
        reason: `objective ${k} missing or out of range [0,1]`,
      };
    }
  }

  // Veto check.
  for (const k of OBJECTIVES) {
    if ((scores as PreferenceScores)[k] < vetoFloor) {
      return {
        allowed: false,
        aggregate: 0,
        vetoed: k,
        perObjective: scores as PreferenceScores,
        reason: `objective ${k} below veto floor (${vetoFloor})`,
      };
    }
  }

  // Weighted aggregate (weights renormalised to sum to 1 for safety).
  const wSum = OBJECTIVES.reduce((acc, k) => acc + (weights[k] || 0), 0) || 1;
  const aggregate = OBJECTIVES.reduce(
    (acc, k) => acc + ((scores as PreferenceScores)[k] * (weights[k] || 0)) / wSum,
    0
  );

  if (aggregate < aggregateFloor) {
    return {
      allowed: false,
      aggregate,
      perObjective: scores as PreferenceScores,
      reason: `weighted aggregate ${aggregate.toFixed(3)} below floor ${aggregateFloor}`,
    };
  }

  return {
    allowed: true,
    aggregate,
    perObjective: scores as PreferenceScores,
  };
}
