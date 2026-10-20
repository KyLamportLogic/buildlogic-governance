import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { clearKillSwitchCache } from "@kypython/buildlogic-governance";
import { isAdminAuthorized } from "./admin-auth.js";
import type { ToolRegistrationOptions } from "./index.js";

const inputSchema = {
  adminToken: z.string().describe("Admin bearer token (AGENT_ADMIN_TOKEN)"),
};

/**
 * Tool: governance/revive
 *
 * Deactivates the server-process kill switch and clears the cache so the next
 * preflight call picks up the updated state immediately.
 */
export function registerReviveTool(
  server: McpServer,
  options: ToolRegistrationOptions
): void {
  server.registerTool(
    "governance/revive",
    {
      title: "Deactivate Kill Switch",
      description:
        "Re-enable AI action execution in this server process.",
      inputSchema,
    },
    async ({ adminToken }) => {

      if (!isAdminAuthorized(options.adminToken, adminToken)) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: false, error: "forbidden" }) },
          ],
          isError: true,
        };
      }

      delete process.env["AI_ACTION_KILL_SWITCH"];
      clearKillSwitchCache();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, killSwitchActive: false }),
          },
        ],
      };
    }
  );
}
