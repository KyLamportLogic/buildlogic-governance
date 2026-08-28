import { evaluateMarketingArtifact, MARKETING_POLICY_VERSION, type MarketingArtifact } from './index';

const valid = (): MarketingArtifact => ({
  artifactId: 'effectproof-discovery-v1', policyVersion: MARKETING_POLICY_VERSION,
  audienceSegments: ['AI engineering leader'], buyingSituation: 'evaluating ambiguous side-effect retries',
  primaryActions: ['book discovery'], primaryMetric: 'qualified discovery calls',
  dominantMessageJobs: ['spreading news'], dominantEmotionalDrivers: ['confidence'],
  claims: [{ text: 'EffectProof tests one intent against intended effects.', status: 'verified', evidence: ['src/invariant.ts'], limitations: ['Vendor coverage is adapter-dependent.'], alternativesAcknowledged: true, technicalPeerReview: true }],
  ethics: { fakeScarcity: false, fakeSocialProof: false, fakeDecoys: false, hiddenTotalCost: false, coerciveFriction: false, obstructedExit: false },
  experiment: { attributionPath: 'utm_campaign=effectproof_discovery_v1', hypothesis: 'The message earns qualified calls.', changedVariables: ['headline'], downstreamGuardrails: ['refund', 'regret', 'complaint', 'trust'], killCriterion: 'Stop after 20 verified contacts and zero qualified replies.' },
  venture: { stage: 'Release', scaleRequested: false, repeatableAcquisitionEvidence: [], repeatableConversionEvidence: [] },
  humanApproval: { claims: true, offer: true, pricing: true, commitments: true },
});

test('allows only a complete artifact', () => expect(evaluateMarketingArtifact(valid()).score).toBe(100));

const denialCases: Array<[string, (artifact: MarketingArtifact) => void]> = [
  ['MG_I_001', (a: MarketingArtifact) => { a.policyVersion = 'stale'; }],
  ['MG_A_001', (a: MarketingArtifact) => { a.audienceSegments.push('founder'); }],
  ['MG_C_001', (a: MarketingArtifact) => { a.primaryActions.push('signup'); }],
  ['MG_C_002', (a: MarketingArtifact) => { a.dominantEmotionalDrivers = []; }],
  ['MG_E_001', (a: MarketingArtifact) => { a.claims[0]!.status = 'unverified'; }],
  ['MG_E_002', (a: MarketingArtifact) => { a.claims[0]!.limitations = []; }],
  ['MG_W_001', (a: MarketingArtifact) => { a.ethics.fakeScarcity = true; }],
  ['MG_X_001', (a: MarketingArtifact) => { a.experiment.attributionPath = ''; }],
  ['MG_X_002', (a: MarketingArtifact) => { a.venture.scaleRequested = true; }],
  ['MG_H_001', (a: MarketingArtifact) => { a.humanApproval.offer = false; }],
];

test.each(denialCases)('denies %s independently', (ruleId, mutate) => {
  const artifact = valid(); mutate(artifact);
  const result = evaluateMarketingArtifact(artifact);
  expect(result.score).toBe(0);
  expect(result.violations.map((v) => v.ruleId)).toContain(ruleId);
});
