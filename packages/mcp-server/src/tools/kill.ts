import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { clearKillSwitchCache } from "@kypython/buildlogic-governance";
import { isAdminAuthorized } from "./admin-auth.js";
import type { ToolRegistrationOptions } from "./index.js";

const inputSchema = {
  adminToken: z.string().describe("Admin bearer token (AGENT_ADMIN_TOKEN)"),
  reason: z.string().optional().describe("Human-readable reason for activation"),
};

/**
 * Tool: governance/kill
 *
 * Activates the server-process kill switch. All subsequent
 * governance/preflight calls in this process will return allowed:false until
 * governance/revive is called.
 * Requires the adminToken that matches AGENT_ADMIN_TOKEN env var.
 */
export function registerKillTool(
  server: McpServer,
  options: ToolRegistrationOptions
): void {
  server.registerTool(
    "governance/kill",
    {
      title: "Activate Kill Switch",
      description:
        "Disable all AI action execution in this server process. " +
        "Every subsequent preflight will return allowed:false until revived.",
      inputSchema,
    },
    async ({ adminToken, reason }) => {

      if (!isAdminAuthorized(options.adminToken, adminToken)) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: false, error: "forbidden" }) },
          ],
          isError: true,
        };
      }

      process.env["AI_ACTION_KILL_SWITCH"] = "true";
      clearKillSwitchCache();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              killSwitchActive: true,
              reason: reason ?? "activated via MCP",
            }),
          },
        ],
      };
    }
  );
}
