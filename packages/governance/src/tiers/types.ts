/**
 * GDM Control Tier Types — Detection (D1–D4) and Prevention (R1–R3)
 */

export type DetectionTier = "D1" | "D2" | "D3" | "D4";
export type PreventionTier = "R1" | "R2" | "R3";

export type GdmSeverity = "info" | "warn" | "critical" | "halt";

/** D1 — Chain-of-Thought monitor input/output */
export interface CotMonitorInput {
  chainOfThought: string;
  actionName?: string;
  turnIndex?: number;
}

export interface CotMonitorResult {
  tier: "D1";
  flagged: boolean;
  signals: string[];
  confidence: number;
  reason?: string;
}

/** D2 — Async safety alert queue */
export interface AgentTraceRecord {
  traceId: string;
  actionName: string;
  userId: string;
  completedAt: string;
  chainOfThought?: string;
  output?: string;
  metadata?: Record<string, unknown>;
}

export interface AsyncAlertResult {
  tier: "D2";
  enqueued: boolean;
  alertId: string;
  flagged: boolean;
  signals: string[];
}

/** D3 — System anomaly metrics */
export interface ResourceMetricsSnapshot {
  apiCallCount: number;
  tokenUsage: number;
  directoryScanCount: number;
  timestamp: string;
}

export interface AnomalyDetectionResult {
  tier: "D3";
  anomalous: boolean;
  driftTriggers: string[];
  zScores: {
    apiCallDensity: number;
    tokenUsageSurge: number;
    directoryScanFrequency: number;
  };
  reason?: string;
}

/** D4 — Mock NLA activation schema */
export interface FeatureActivationNode {
  nodeId: string;
  activation: number;
  label?: string;
}

export interface NlaActivationSchema {
  layerId: string;
  nodes: FeatureActivationNode[];
  source?: "sae" | "simulated" | "manual";
}

export interface NlaVerificationResult {
  tier: "D4";
  flagged: boolean;
  evalAwarenessScore: number;
  concealmentScore: number;
  activeNodes: string[];
  reason?: string;
}

/** R1 — Prompt binding registry */
export interface PromptBindingEntry {
  systemPromptHash: string;
  toolsHash: string;
  configHash: string;
  registeredAt: string;
  authorizedBy?: string;
}

export interface PromptBindingPayload {
  systemPrompt: string;
  tools: unknown[];
  config: Record<string, unknown>;
}

export interface PromptBindingVerifyResult {
  tier: "R1";
  ok: boolean;
  driftDetected: boolean;
  mismatches: string[];
  reason?: string;
}

/** R2 — Ghost fork transaction */
export interface GhostForkHandle {
  forkId: string;
  createdAt: string;
  status: "active" | "promoted" | "discarded";
}

export interface GhostForkOperation<T = unknown> {
  label: string;
  execute: (forkId: string) => Promise<T>;
}

export interface GhostForkResult<T = unknown> {
  tier: "R2";
  ok: boolean;
  forkId: string;
  promoted: boolean;
  discarded: boolean;
  result?: T;
  traceback?: GhostForkTracebackEntry[];
  reason?: string;
}

export interface GhostForkTracebackEntry {
  step: string;
  timestamp: string;
  detail?: string;
}

/** R3 — Risk ceilings & kill switch */
export interface RiskCeilingConfig {
  maxTokenBudget: number;
  maxUnauthorizedToolCalls: number;
  blockedFilePatterns: RegExp[];
  maxRiskLevel: number;
}

export interface RiskCeilingState {
  tokensConsumed: number;
  unauthorizedToolCalls: number;
  fileAccessAttempts: string[];
}

export interface RiskCeilingCheckInput {
  tokensDelta?: number;
  toolCall?: { name: string; authorized: boolean };
  filePath?: string;
  riskLevel?: number;
}

export interface RiskCeilingResult {
  tier: "R3";
  breached: boolean;
  breachType?: "token_budget" | "unauthorized_tool" | "file_access" | "risk_level" | "hst_kill" | "prompt_injection_kill";
  reason?: string;
  frozen: boolean;
}

/** TRACE protocol */
export interface TraceClaimScope {
  claimId: string;
  claim: string;
  targetAction?: string;
}

export interface TraceCueCandidate {
  cueId: string;
  pattern: RegExp;
  description: string;
  category: "evaluator_format" | "synthetic_filename" | "sandbox_prompt" | "other";
}

export interface TraceEvidenceProbe {
  logEntry: string;
  evalAwarenessSignals: string[];
  score: number;
}

export interface TraceCounterfactualResult {
  originalScore: number;
  ablatedScore: number;
  behavioralDivergence: number;
  muT: number;
  muD: number;
}

export interface TraceAuditResult {
  claimId: string;
  claimRestricted: boolean;
  claimRestrictionRecord?: ClaimRestrictionRecord;
  cueAudit: TraceCueCandidate[];
  evidenceProbes: TraceEvidenceProbe[];
  counterfactual: TraceCounterfactualResult;
  reason?: string;
}

export interface ClaimRestrictionRecord {
  claimId: string;
  claim: string;
  flaggedAt: string;
  muT: number;
  muD: number;
  divergence: number;
  reason: string;
}

/** T.A.N. — Self++ co-determination */
export type TaskStakes = "low" | "medium" | "high" | "critical";

export interface TanExecutionPlan {
  planId: string;
  summary: string;
  toolDependencies: string[];
  confidenceBoundaries: {
    min: number;
    max: number;
    assumptions: string[];
  };
  stakes: TaskStakes;
  requiresHumanApproval: boolean;
}

export interface TanApprovalCheckpoint {
  checkpointId: string;
  planId: string;
  status: "pending" | "approved" | "contested" | "rolled_back";
  contestedAssumptions?: string[];
  editedGoals?: string;
}

export interface TanAdaptiveScaffold {
  stakes: TaskStakes;
  enabledTiers: DetectionTier[];
  enabledPrevention: PreventionTier[];
  intensityMultiplier: number;
}

/** Unified GDM stack result */
export interface GdmStackInput {
  actionName: string;
  userId: string;
  chainOfThought?: string;
  proposedOutput?: string;
  promptBinding?: PromptBindingPayload;
  resourceMetrics?: Omit<ResourceMetricsSnapshot, "timestamp">;
  nlaSchema?: NlaActivationSchema;
  riskCheck?: RiskCeilingCheckInput;
  stakes?: TaskStakes;
}

export interface GdmStackResult {
  allowed: boolean;
  blockedBy?: DetectionTier | PreventionTier | "TRACE" | "TAN";
  reason?: string;
  detection: {
    d1?: CotMonitorResult;
    d2?: AsyncAlertResult;
    d3?: AnomalyDetectionResult;
    d4?: NlaVerificationResult;
  };
  prevention: {
    r1?: PromptBindingVerifyResult;
    r3?: RiskCeilingResult;
  };
  tan?: TanAdaptiveScaffold;
  timestamp: string;
}
