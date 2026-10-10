// Core harness factory
export { createHarness } from "./harness.js";
export { createHardwareKillOnBlock } from "./hardware-kill.js";

// Types
export type {
  ProviderAdapter,
  HarnessResult,
  HarnessConfig,
  InvokeOptions,
  BlockHandler,
  AuditEntry,
  AuditLogger,
  Harness,
  GovernanceContract,
  PreflightResult,
  ExecutionContext,
  PreferenceScores,
  PromptBindingPayload,
  TaskStakes,
  TanExecutionPlan,
  TanApprovalCheckpoint,
} from "./types.js";

// Middleware (standalone utilities)
export {
  runPreflight,
  assertAllowed,
  GovernanceBlockedError,
  defaultAuditLogger,
  nullAuditLogger,
} from "./middleware/index.js";

// Provider adapters
export {
  createOpenAIProvider,
  createAnthropicProvider,
  createGenericProvider,
} from "./providers/index.js";
