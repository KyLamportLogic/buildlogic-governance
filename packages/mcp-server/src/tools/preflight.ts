import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { runGovernancePreflight } from "@kypython/buildlogic-governance";

const inputSchema = {
  actionName: z.string().min(1).describe("Name of the action to preflight"),
  userId: z.string().min(1).describe("Caller user ID for audit trail"),
  params: z
    .record(z.unknown())
    .optional()
    .describe("Action parameters — include _governance key for contract"),
};

/**
 * Tool: governance/preflight
 *
 * Runs runGovernancePreflight (kill → policy → contract → hash → risk →
 * optional alignment → mandatory GDM). Does NOT auto-scan params for SSRF;
 * callers must use validateEgressUrl separately. Returns PreflightResult.
 * The model MUST call this before executing any side-effectful action.
 */
export function registerPreflightTool(server: McpServer): void {
  server.registerTool(
    "governance/preflight",
    {
      title: "Governance Preflight",
      description:
        "Run fail-close governance checks before executing an AI action. " +
        "Returns allowed:true or allowed:false with reason and audit timings.",
      inputSchema,
    },
    async ({ actionName, userId, params = {} }) => {

      const result = await runGovernancePreflight(actionName, params, {
        userId,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
