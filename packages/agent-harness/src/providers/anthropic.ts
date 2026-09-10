import type { ProviderAdapter } from "../types.js";
import type { ExecutionContext } from "@kypython/buildlogic-governance";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicInput {
  messages: AnthropicMessage[];
  system?: string;
  model?: string;
  max_tokens?: number;
}

export interface AnthropicOutput {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicProviderConfig {
  /** API key. Defaults to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Default model. Defaults to "claude-sonnet-4-6". */
  model?: string;
  /** Default max tokens. Defaults to 1024. */
  maxTokens?: number;
}

/**
 * Adapter for Anthropic Messages API.
 * Requires `@anthropic-ai/sdk` package as a peer dependency.
 */
export function createAnthropicProvider(
  config: AnthropicProviderConfig = {}
): ProviderAdapter<AnthropicInput, AnthropicOutput> {
  return {
    name: "anthropic",

    async invoke(input: AnthropicInput, _context: ExecutionContext): Promise<AnthropicOutput> {
      // Lazy import so @anthropic-ai/sdk is a true optional peer dep
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let Anthropic: any;
      try {
        const mod = await import("@anthropic-ai/sdk");
        Anthropic = mod.default ?? mod;
      } catch {
        throw new Error(
          "@anthropic-ai/sdk package not found — run: pnpm add @anthropic-ai/sdk"
        );
      }

      const client = new Anthropic({
        apiKey: config.apiKey ?? process.env["ANTHROPIC_API_KEY"],
      });

      const response = await client.messages.create({
        model: input.model ?? config.model ?? "claude-sonnet-4-6",
        max_tokens: input.max_tokens ?? config.maxTokens ?? 1024,
        messages: input.messages,
        ...(input.system ? { system: input.system } : {}),
      });

      return response as unknown as AnthropicOutput;
    },
  };
}
