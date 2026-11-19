import type {
  GovernanceContract,
  PreflightResult,
  ExecutionContext,
  GovernancePolicy,
  PreferenceScores,
  PromptBindingPayload,
  NlaActivationSchema,
  RiskCeilingCheckInput,
  TaskStakes,
  TanApprovalCheckpoint,
  TanExecutionPlan,
} from "@kypython/buildlogic-governance";

export type {
  GovernanceContract,
  PreflightResult,
  ExecutionContext,
  PreferenceScores,
  PromptBindingPayload,
  TaskStakes,
  TanExecutionPlan,
  TanApprovalCheckpoint,
};

/**
 * Adapter interface — implement this for any LLM provider.
 * OpenAI, Anthropic, Gemini, or any fetch-based provider.
 */
export interface ProviderAdapter<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  invoke(input: TInput, context: ExecutionContext): Promise<TOutput>;
}

/**
 * Result returned by harness.invoke() for every call.
 */
export interface HarnessResult<TOutput = unknown> {
  allowed: boolean;
  output?: TOutput;
  blocked?: {
    reason: string;
    preflight: PreflightResult;
  };
  audit: PreflightResult["audit"];
  timings: PreflightResult["timings"];
}

/**
 * Optional per-invocation governance override.
 * Merges with defaults set at harness construction time.
 */
export interface InvokeOptions {
  contract?: GovernanceContract;
  /** Override the action name used for policy lookups and audit logs. */
  actionName?: string;
  /**
   * Optional alignment metadata. Forwarded to the governance pipeline as
   * underscore-prefixed params (stripped from hash binding). Only acted on
   * when the matching opt-in policy flag is enabled.
   */
  preferenceScores?: PreferenceScores;
  proposedOutput?: string;
  internalReasoning?: string;
  priorTurnWasDisagreement?: boolean;

  /** GDM control stack metadata (always enforced — mandatory governance law). */
  chainOfThought?: string;
  gdmRegistryKey?: string;
  gdmStakes?: TaskStakes;
  gdmPromptBinding?: PromptBindingPayload;
  gdmResourceMetrics?: {
    apiCallCount: number;
    tokenUsage: number;
    directoryScanCount: number;
  };
  gdmNlaSchema?: NlaActivationSchema;
  gdmRiskCheck?: RiskCeilingCheckInput;
  tanPlan?: TanExecutionPlan;
  tanCheckpoint?: TanApprovalCheckpoint;
}

/**
 * Callback fired when governance blocks an invocation.
 * Use for telemetry, alerting, or human escalation hooks.
 */
export type BlockHandler = (
  actionName: string,
  result: PreflightResult,
  context: ExecutionContext
) => void | Promise<void>;

/**
 * Structured entry written to the audit log on every invocation.
 */
export interface AuditEntry {
  ts: string;
  actionName: string;
  userId: string;
  allowed: boolean;
  reason?: string;
  timings: PreflightResult["timings"];
  decisions: PreflightResult["decisions"];
}

export type AuditLogger = (entry: AuditEntry) => void | Promise<void>;

/**
 * Configuration passed to createHarness().
 */
export interface HarnessConfig<TInput = unknown, TOutput = unknown> {
  /** LLM provider adapter to wrap. */
  provider: ProviderAdapter<TInput, TOutput>;
  /**
   * Partial policy overrides. Merged over the policy loaded from env vars.
   * Use to tighten (never loosen) defaults at the harness level.
   * GDM control stack (enableGdmStack) cannot be overridden — mandatory law.
   */
  policyOverrides?: Partial<Omit<GovernancePolicy, "enableGdmStack">>;
  /** Called synchronously after every blocked invocation. */
  onBlock?: BlockHandler;
  /** Called synchronously after every invocation (allowed or blocked). */
  auditLogger?: AuditLogger;
}

/**
 * The harness object returned by createHarness().
 */
export interface Harness<TInput = unknown, TOutput = unknown> {
  readonly providerName: string;
  invoke(
    input: TInput,
    context: ExecutionContext,
    options?: InvokeOptions
  ): Promise<HarnessResult<TOutput>>;
}
