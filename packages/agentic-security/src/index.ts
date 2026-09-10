/**
 * @kypython/buildlogic-agentic-security
 *
 * Agentic Security Defense Architecture — SDK wrappers + posture.
 * SSOT: docs/quality/agentic-security-defense-architecture.md
 */

export {
  guardChatWithAidr,
  messagesFromHarnessInput,
  __setAidrClientFactoryForTesting,
  __resetAidrClientFactory,
} from "./aidr-guard";
export type { AidrClientLike } from "./aidr-guard";

export {
  findBannedDebugToolsInDockerfile,
  BANNED_DEBUG_PACKAGES,
  MEMORY_HARDENING_RECOMMENDATIONS,
} from "./container-hardening";

export { appendWormAudit } from "./worm-audit";
export { pollGuardDutyPosture } from "./guardduty-posture";
export { buildPostureReport } from "./posture";
export { gateAgenticSideEffect } from "./gate";
export type { GateAgenticSideEffectResult } from "./gate";

export {
  resolveSecret,
  revokeSecret,
  __setSecretsClientFactoryForTesting,
  __resetSecretsClientFactory,
  __clearSecretsCacheForTesting,
} from "./secrets-jit";
export type { InfisicalClientLike } from "./secrets-jit";

export type {
  ControlLayer,
  ControlStatus,
  AidrGuardInput,
  AidrGuardResult,
  WormAppendInput,
  WormAppendResult,
  GuardDutyPostureResult,
  ContainerHardeningFinding,
  AgenticPostureControl,
  AgenticPostureReport,
  SecretSource,
  SecretResolution,
} from "./types";
