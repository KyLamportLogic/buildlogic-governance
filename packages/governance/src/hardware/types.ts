export type GovernanceKillSource =
  | "hardware"
  | "software"
  | "mcp"
  | "operator"
  | "threshold"
  | "governance";

export interface GovernanceStateFile {
  version: 1;
  updatedAt: string;
  aiActionKillSwitch: boolean;
  aiHstKillToken?: string;
  source?: GovernanceKillSource;
  reason?: string;
  sentinel?: {
    connected?: boolean;
    port?: string;
    lastTelemetry?: Record<string, unknown>;
  };
}

export interface SentinelTelemetry {
  temperature?: number;
  current_a?: number;
  power_w?: number;
  kill_active?: boolean;
  risk?: number;
  risk_trip?: number;
  uptime_ms?: number;
}

export interface SentinelHealth {
  status: string;
  arduino_connected: boolean;
  arduino_port?: string | null;
  mock?: boolean;
  firmware?: string;
  uptime_s?: number;
  capabilities?: Record<string, unknown>;
}

/** Payload stored under Redis kill key (and mirrored in state file). */
export interface KillBusPayload {
  active: boolean;
  updatedAt: string;
  source?: GovernanceKillSource;
  reason?: string;
  aiHstKillToken?: string;
}
