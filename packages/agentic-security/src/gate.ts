/**
 * Compose @kypython/buildlogic-governance toll booth + Falcon AIDR prompt guard.
 */

import {
  gateAiSideEffect,
  type GateAiSideEffectOptions,
  type GateAiSideEffectResult,
} from "@kypython/buildlogic-governance";
import { guardChatWithAidr, messagesFromHarnessInput } from "./aidr-guard";
import { appendWormAudit } from "./worm-audit";

export interface GateAgenticSideEffectResult extends GateAiSideEffectResult {
  aidr?: Awaited<ReturnType<typeof guardChatWithAidr>>;
  worm?: Awaited<ReturnType<typeof appendWormAudit>>;
}

/**
 * Fail-close chain: local governance → Falcon AIDR → optional WORM audit of deny/allow.
 */
export async function gateAgenticSideEffect(
  options: GateAiSideEffectOptions & {
    promptMessages?: Array<{ role: string; content: string }>;
    wormKey?: string;
  }
): Promise<GateAgenticSideEffectResult> {
  const gov = await gateAiSideEffect(options);
  if (!gov.allowed) {
    const worm = await maybeWorm("deny-governance", gov, options.wormKey);
    return { ...gov, worm };
  }

  const messages =
    options.promptMessages ??
    messagesFromHarnessInput(options.params);
  const aidr = await guardChatWithAidr({ messages });
  if (!aidr.allowed) {
    const worm = await maybeWorm("deny-aidr", { aidr }, options.wormKey);
    return {
      allowed: false,
      reason: aidr.reason,
      preflight: gov.preflight,
      paramsWithContract: gov.paramsWithContract,
      aidr,
      worm,
    };
  }

  const worm = await maybeWorm("allow", { aidr }, options.wormKey);
  return { ...gov, aidr, worm };
}

async function maybeWorm(
  outcome: string,
  payload: unknown,
  wormKey?: string
) {
  const bucket = process.env.AGENTIC_WORM_S3_BUCKET?.trim();
  if (!bucket && !wormKey) {
    return appendWormAudit({
      bucket: "",
      key: `agentic-security/${outcome}/${Date.now()}.json`,
      body: JSON.stringify({ outcome, payload, ts: new Date().toISOString() }),
    });
  }
  return appendWormAudit({
    bucket: bucket || "",
    key:
      wormKey ||
      `agentic-security/${outcome}/${new Date().toISOString()}.json`,
    body: JSON.stringify({ outcome, payload, ts: new Date().toISOString() }),
  });
}
