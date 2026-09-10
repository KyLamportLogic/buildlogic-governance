/* governance-controls: AI_ACTION_KILL_SWITCH, input_hash, allowed: false, trustPipelineMs, governanceDecisionMs, Promise.all([ */
import type { ProviderAdapter } from "../types.js";
import type { ExecutionContext } from "@kypython/buildlogic-governance";

export interface GenericMessage {
  role: string;
  content: string;
}

export interface GenericInput {
  messages: GenericMessage[];
  model?: string;
  [key: string]: unknown;
}

export interface GenericOutput {
  raw: unknown;
}

export interface GenericProviderConfig {
  /** Friendly name shown in audit logs. */
  name: string;
  /** Full URL to the completions endpoint, e.g. "http://localhost:11434/v1/chat/completions" */
  baseUrl: string;
  /** Bearer token (API key). Pass empty string for unauthenticated local endpoints. */
  apiKey: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * Minimal fetch-based adapter for any OpenAI-compatible completions endpoint.
 * Covers OpenRouter, Together AI, local Ollama, LM Studio, etc.
 * No extra dependencies — uses the Node 18+ global fetch.
 */
export function createGenericProvider(
  config: GenericProviderConfig
): ProviderAdapter<GenericInput, GenericOutput> {
  return {
    name: config.name,

    async invoke(input: GenericInput, context: ExecutionContext): Promise<GenericOutput> {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 30_000
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Audit-UserId": context.userId,
        ...config.headers,
      };

      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }

      let response: Response;
      try {
        response = await fetch(config.baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "(unreadable)");
        throw new Error(
          `${config.name} returned ${response.status}: ${body}`
        );
      }

      const raw = await response.json();
      return { raw };
    },
  };
}
