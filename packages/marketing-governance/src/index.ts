import { createHash } from 'node:crypto';
import { MARKETING_POLICY_VERSION, MARKETING_RULES, type MarketingRuleId } from './policy';

export { MARKETING_POLICY_VERSION, MARKETING_RULES } from './policy';
export type { MarketingRuleId } from './policy';

export type VentureStage = 'Create' | 'Release' | 'Morph' | 'Model' | 'Scale' | 'Harvest';
export type ClaimStatus = 'verified' | 'partially_verified' | 'unverified';

export interface MarketingClaim {
  text: string;
  status: ClaimStatus;
  evidence: string[];
  limitations: string[];
  alternativesAcknowledged: boolean;
  technicalPeerReview: boolean;
}

export interface MarketingArtifact {
  artifactId: string;
  policyVersion: string;
  audienceSegments: string[];
  buyingSituation: string;
  primaryActions: string[];
  primaryMetric: string;
  dominantMessageJobs: string[];
  dominantEmotionalDrivers: string[];
  claims: MarketingClaim[];
  ethics: Record<'fakeScarcity' | 'fakeSocialProof' | 'fakeDecoys' | 'hiddenTotalCost' | 'coerciveFriction' | 'obstructedExit', boolean>;
  experiment: {
    attributionPath: string;
    hypothesis: string;
    changedVariables: string[];
    downstreamGuardrails: Array<'refund' | 'regret' | 'complaint' | 'trust'>;
    killCriterion: string;
  };
  venture: {
    stage: VentureStage;
    scaleRequested: boolean;
    repeatableAcquisitionEvidence: string[];
    repeatableConversionEvidence: string[];
  };
  humanApproval: Record<'claims' | 'offer' | 'pricing' | 'commitments', boolean>;
}

export interface MarketingDecision {
  allowed: boolean;
  score: 0 | 100;
  terms: Record<'I' | 'A' | 'C' | 'E' | 'W' | 'X' | 'H', 0 | 1>;
  violations: Array<{ ruleId: MarketingRuleId; message: string }>;
  policyVersion: string;
  policyHash: string;
}

const nonEmpty = (value: string): boolean => value.trim().length > 0;
const one = (values: string[]): boolean => values.length === 1 && nonEmpty(values[0] ?? '');

export function marketingPolicyHash(): string {
  return createHash('sha256').update(JSON.stringify({ version: MARKETING_POLICY_VERSION, rules: MARKETING_RULES })).digest('hex');
}

export function evaluateMarketingArtifact(artifact: MarketingArtifact): MarketingDecision {
  const violations: MarketingDecision['violations'] = [];
  const deny = (ruleId: MarketingRuleId): void => { violations.push({ ruleId, message: MARKETING_RULES[ruleId] }); };
  const I = artifact.policyVersion === MARKETING_POLICY_VERSION ? 1 : 0;
  if (!I) deny('MG_I_001');
  const A = one(artifact.audienceSegments) && nonEmpty(artifact.buyingSituation) ? 1 : 0;
  if (!A) deny('MG_A_001');
  const action = one(artifact.primaryActions) && nonEmpty(artifact.primaryMetric) && one(artifact.dominantMessageJobs);
  const emotion = one(artifact.dominantEmotionalDrivers);
  const C = action && emotion ? 1 : 0;
  if (!action) deny('MG_C_001');
  if (!emotion) deny('MG_C_002');
  const evidence = artifact.claims.length > 0 && artifact.claims.every((c) => nonEmpty(c.text) && c.status === 'verified' && c.evidence.some(nonEmpty));
  const trust = artifact.claims.length > 0 && artifact.claims.every((c) => c.limitations.some(nonEmpty) && c.alternativesAcknowledged && c.technicalPeerReview);
  const E = evidence && trust ? 1 : 0;
  if (!evidence) deny('MG_E_001');
  if (!trust) deny('MG_E_002');
  const W = Object.values(artifact.ethics).every((v) => v === false) ? 1 : 0;
  if (!W) deny('MG_W_001');
  const guards = new Set<string>(artifact.experiment.downstreamGuardrails);
  const experiment = nonEmpty(artifact.experiment.attributionPath) && nonEmpty(artifact.experiment.hypothesis)
    && artifact.experiment.changedVariables.length === 1 && nonEmpty(artifact.experiment.changedVariables[0] ?? '')
    && ['refund', 'regret', 'complaint', 'trust'].every((g) => guards.has(g)) && nonEmpty(artifact.experiment.killCriterion);
  const stage = !artifact.venture.scaleRequested || (
    ['Model', 'Scale', 'Harvest'].includes(artifact.venture.stage)
    && artifact.venture.repeatableAcquisitionEvidence.some(nonEmpty)
    && artifact.venture.repeatableConversionEvidence.some(nonEmpty)
  );
  const X = experiment && stage ? 1 : 0;
  if (!experiment) deny('MG_X_001');
  if (!stage) deny('MG_X_002');
  const H = Object.values(artifact.humanApproval).every((v) => v === true) ? 1 : 0;
  if (!H) deny('MG_H_001');
  const terms = { I, A, C, E, W, X, H } as MarketingDecision['terms'];
  const score = (100 * I * A * C * E * W * X * H) as 0 | 100;
  return { allowed: score === 100, score, terms, violations, policyVersion: MARKETING_POLICY_VERSION, policyHash: marketingPolicyHash() };
}
