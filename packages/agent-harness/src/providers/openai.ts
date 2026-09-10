import type { ProviderAdapter } from "../types.js";
import type { ExecutionContext } from "@kypython/buildlogic-governance";

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIInput {
  messages: OpenAIMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIOutput {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface OpenAIProviderConfig {
  /** API key. Defaults to OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Default model. Defaults to "gpt-4o". */
  model?: string;
  /** Override base URL for OpenAI-compatible APIs (e.g. OpenRouter, Ollama). */
  baseURL?: string;
}

/**
 * Adapter for OpenAI Chat Completions API.
 * Requires `openai` package as a peer dependency.
 */
export function createOpenAIProvider(
  config: OpenAIProviderConfig = {}
): ProviderAdapter<OpenAIInput, OpenAIOutput> {
  return {
    name: "openai",

    async invoke(input: OpenAIInput, _context: ExecutionContext): Promise<OpenAIOutput> {
      // Lazy import so openai is a true optional peer dep
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let OpenAI: any;
      try {
        const mod = await import("openai");
        OpenAI = mod.default ?? mod;
      } catch {
        throw new Error(
          "openai package not found — run: pnpm add openai"
        );
      }

      const client = new OpenAI({
        apiKey: config.apiKey ?? process.env["OPENAI_API_KEY"],
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      });

      const response = await client.chat.completions.create({
        model: input.model ?? config.model ?? "gpt-4o",
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
      });

      return response as OpenAIOutput;
    },
  };
}
