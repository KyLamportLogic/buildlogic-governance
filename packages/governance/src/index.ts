/**
 * AI Governance Toll Booth — Public API
 *
 * @ai-generated {
 *   confidence: 0.95,
 *   reasoning: "Clean barrel export from core modules",
 *   fallback: "None"
 * }
 */

// Core orchestrator
export { runGovernancePreflight, validateEgressUrl, validateEgressUrlsBatch } from "./orchestrator";
export {
  gateAiSideEffect,
  assertAiSideEffectAllowed,
} from "./gateSideEffect";
export type {
  GateAiSideEffectOptions,
  GateAiSideEffectResult,
} from "./gateSideEffect";

// Components
export { checkKillSwitch, setKillSwitchForTesting, clearKillSwitchCache } from "./killSwitch";
export * as hardwareGovernance from "./hardware";
export { hashValue, computeExpectedHash, validateHashBinding, createHashBinding } from "./hashBinding";
export { ArtifactRegistry, FailCloseHarness, computeSha256 } from "./artifactHash";
export type { Artifact } from "./artifactHash";
export { computeStrictHash, enforceStrictBindingOrThrow, GovernanceDriftError } from "./strictHashBinding";
export {
  canonicalizeHostToIp,
  isHttpsRequired,
  isPrivateOrReservedIp,
  unwrapIpv4Mapped,
  validateOutboundUrl,
  validateOutboundUrlsBatch,
} from "./egressValidator";
export { validateContract, isValidGovernanceContract } from "./contractValidator";
export { loadGovernancePolicy, createDefaultPolicy, createPermissivePolicy, isActionAllowedByPolicy, isRiskLevelAllowed, getEffectiveMaxRiskLevel } from "./policyEngine";
export { createTrustMetrics, recordComponentTiming, recordOutboundValidationCheck, computeTrustPipelineMs, mergeMetrics, summarizeMetrics, extractMetricsFromPreflight } from "./trustMetrics";

// Alignment extensions
export { evaluatePreferences } from "./preferenceEvaluator";
export { auditLatentDeception } from "./deceptionAuditor";
export { createCircuitBreaker, getSharedCircuitBreaker, resetSharedCircuitBreaker } from "./circuitBreaker";

// Dual-pass cognitive protocol (scratchpad + governed_action)
export {
  GovernanceException,
  GovernedActionSchema,
  GovernedToolActionSchema,
  GovernedHaltActionSchema,
  extractXmlTag,
  parseDualPassOutput,
  validateGovernedAction,
  auditDualPass,
  validateDualPassCompletion,
  assertDualPassDispatch,
  DUAL_PASS_SYSTEM_APPENDIX,
  dualPassRequiredByEnv,
} from "./dualPassProtocol";
export type {
  GovernedAction,
  DualPassParsed,
  DualPassAuditResult,
  DualPassResult,
  DualPassDispatchInput,
} from "./dualPassProtocol";

// Runtime Supervisor (dual-pass XML + SSRF + MAD execution gate)
export {
  BuildLogicRuntimeSupervisor,
  parseSupervisorDualPass,
  auditPayloadForSsrf,
  auditMechanisticAnomaly,
  collectStringLeaves,
  extractDestinationsFromText,
  isBlockedDestination,
} from "./runtimeSupervisor";
export type {
  AgentStepInput,
  AuditResult,
  RuntimeSupervisorState,
  ProcessAgentTurnResult,
  PlaywrightPageLike,
  SupervisorLogger,
  BuildLogicRuntimeSupervisorOptions,
  RuntimeSupervisorGovernedAction,
} from "./runtimeSupervisor";

// GDM Control Tiers (D1–D4 detection, R1–R3 prevention, TRACE, T.A.N.)
export {
  monitorChainOfThought,
  enqueueCompletedTrace,
  onTraceAlert,
  drainMonitoringQueue,
  getMonitoringQueueSize,
  resetMonitoringQueue,
  detectSystemAnomaly,
  resetAnomalyWindow,
  verifyNlaActivationSchema,
  hashPromptComponent,
  computePromptBindingHashes,
  registerPromptBinding,
  verifyPromptBinding,
  enforcePromptBindingOrThrow,
  clearPromptBindingRegistry,
  getPromptBindingEntry,
  PromptBindingDriftError,
  PROMPT_INJECTION_PATTERNS,
  isPromptInjectionDrift,
  verifyPromptBindingWithKillEscalation,
  executeInGhostFork,
  InMemoryGhostForkAdapter,
  readWormLog,
  clearWormLog,
  loadRiskCeilingConfig,
  validateHstKillSwitch,
  checkRiskCeilings,
  enforceRiskCeilingsOrFreeze,
  getRiskCeilingState,
  resetRiskCeilingState,
  setProcessExitHandlerForTesting,
  resetProcessExitHandler,
  triggerKillSwitchFromPromptInjection,
  runTraceAudit,
  ablateEvaluationCues,
  DEFAULT_TRACE_CUES,
  buildExecutionPlan,
  formatExecutionPlanBlock,
  computeAdaptiveScaffold,
  createApprovalCheckpoint,
  approveCheckpoint,
  contestCheckpoint,
  rollbackCheckpoint,
  mayProceedWithPlan,
  resetTanCheckpoints,
  getCheckpoint,
  DEFAULT_STANDING_APPROVAL_TTL_DAYS,
  DEFAULT_STANDING_REMINDER_LEAD_DAYS,
  HIGH_STAKES_AUTOMATION_SCOPES,
  grantStandingApproval,
  getStandingApproval,
  listStandingApprovalsForUser,
  isStandingApprovalValid,
  findActiveStandingApproval,
  mayProceedWithStandingApproval,
  revokeStandingApproval,
  renewStandingApproval,
  expireStandingApprovals,
  listApprovalsNeedingReminder,
  markStandingApprovalReminded,
  resetStandingApprovals,
  hydrateStandingApprovals,
  isHighStakesAutomationScope,
  runGdmControlStack,
} from "./tiers";
export type {
  DetectionTier,
  PreventionTier,
  GdmSeverity,
  CotMonitorInput,
  CotMonitorResult,
  AgentTraceRecord,
  AsyncAlertResult,
  ResourceMetricsSnapshot,
  AnomalyDetectionResult,
  FeatureActivationNode,
  NlaActivationSchema,
  NlaVerificationResult,
  PromptBindingEntry,
  PromptBindingPayload,
  PromptBindingVerifyResult,
  GhostForkHandle,
  GhostForkOperation,
  GhostForkResult,
  GhostForkTracebackEntry,
  RiskCeilingConfig,
  RiskCeilingState,
  RiskCeilingCheckInput,
  RiskCeilingResult,
  TraceClaimScope,
  TraceCueCandidate,
  TraceEvidenceProbe,
  TraceCounterfactualResult,
  TraceAuditResult,
  ClaimRestrictionRecord,
  TaskStakes,
  TanExecutionPlan,
  TanApprovalCheckpoint,
  TanAdaptiveScaffold,
  StandingApproval,
  StandingApprovalStatus,
  StandingAutomationKind,
  GrantStandingApprovalInput,
  GdmStackInput,
  GdmStackResult,
  MonitoringQueueEntry,
  TraceListener,
  GhostForkAdapter,
  GhostForkExecuteOptions,
  ProcessExitHandler,
  TraceAuditInput,
  RunGdmStackOptions,
  PromptBindingEscalationResult,
} from "./tiers";

// Types
export type {
  GovernanceContract,
  PreflightResult,
  ExecutionContext,
  TrustMetrics,
  GovernancePolicy,
  EgressValidationResult,
  HashBindingResult,
  ContractValidationResult,
  KillSwitchResult,
  PreferenceScores,
  PreferenceEvaluationInput,
  PreferenceEvaluationResult,
  DeceptionAuditInput,
  DeceptionAuditResult,
  DependencyDecision,
  SystemsThinkingContract,
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitBreakerState,
  CircuitBreakerGuardResult,
} from "./types";
