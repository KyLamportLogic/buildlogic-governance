export const MARKETING_POLICY_VERSION = '2026-08-28.1' as const;

export const MARKETING_RULES = {
  MG_I_001: 'Artifact policy version must equal the evaluator policy version.',
  MG_A_001: 'One artifact addresses exactly one defined ICP and buying situation.',
  MG_C_001: 'One artifact has exactly one measurable primary action and one dominant message job.',
  MG_C_002: 'Public copy has exactly one dominant emotional driver.',
  MG_E_001: 'Every material public claim is verified by implementation or customer evidence.',
  MG_E_002: 'Every material claim names limitations, acknowledges alternatives, and survives technical-peer scrutiny.',
  MG_W_001: 'No fake scarcity, fake social proof, fake decoys, hidden total cost, coercive friction, or obstructed exit is allowed.',
  MG_X_001: 'Every launch has attribution, a falsifiable test, one changed variable, downstream guardrails, and a kill criterion.',
  MG_X_002: 'Release-stage work cannot request scale before repeatable acquisition and conversion evidence exists.',
  MG_H_001: 'A human must approve claims, offer, pricing, and commitments before publication or outreach.',
} as const;

export type MarketingRuleId = keyof typeof MARKETING_RULES;
