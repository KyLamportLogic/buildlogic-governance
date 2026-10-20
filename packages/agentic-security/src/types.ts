/**
 * Agentic Security Defense — shared types.
 * SSOT: docs/quality/agentic-security-defense-architecture.md
 */

export type ControlLayer =
  | "software"
  | "container"
  | "cloud-aws"
  | "endpoint-crowdstrike"
  | "ci";

export type ControlStatus =
  | "wired-always"
  | "wired-when-configured"
  | "adapter-ready"
  | "blocked-needs-account";

export interface AidrGuardInput {
  messages: Array<{ role: string; content: string }>;
  /** Optional recipe / policy id from Falcon AIDR console. */
  recipe?: string;
}

export interface AidrGuardResult {
  allowed: boolean;
  reason: string;
  /** true when AIDR cloud call was skipped (no token / local mode). */
  skipped: boolean;
  blocked?: boolean;
  requestId?: string;
  detectors?: Record<string, unknown>;
}

export interface WormAppendInput {
  bucket: string;
  key: string;
  body: string | Uint8Array;
  /** Object Lock retention days (Compliance Mode). Default 90. */
  retentionDays?: number;
}

export interface WormAppendResult {
  ok: boolean;
  reason: string;
  skipped: boolean;
  etag?: string;
  versionId?: string;
}

export interface GuardDutyPostureResult {
  ok: boolean;
  reason: string;
  skipped: boolean;
  findingCount?: number;
  highSeverityCount?: number;
}

export interface ContainerHardeningFinding {
  file: string;
  package: string;
  line: number;
}

export interface AgenticPostureControl {
  id: string;
  layer: ControlLayer;
  status: ControlStatus;
  evidence: string;
  continuous?: boolean;
}

export interface AgenticPostureReport {
  generatedAt: string;
  defenseScore: number;
  continuousCoverage: number;
  controls: AgenticPostureControl[];
  blocked: string[];
  wired: string[];
}

/** Where a resolved secret actually came from — kept legible, never hidden. */
export type SecretSource = "jit-vault" | "env-fallback";

export interface SecretResolution {
  ok: boolean;
  /** Present only when ok=true. Never interpolate into logs/errors — use `redacted`. */
  value?: string;
  source?: SecretSource;
  /** Safe-to-log stand-in for `value`. */
  redacted?: string;
  /** Set when ok=false: why no usable secret was found. */
  reason?: string;
  /** Set when ok=true via env-fallback: a nudge to migrate, not a failure. */
  warning?: string;
}
