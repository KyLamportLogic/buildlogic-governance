import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPreflightTool } from "./preflight.js";
import { registerKillTool } from "./kill.js";
import { registerReviveTool } from "./revive.js";
import { registerStatusTool } from "./status.js";

// Fail-closed admin-token guard lives in its own module (no preflight/zod
// imports) so tests and other consumers can import it without dragging the
// whole tool graph into their compilation unit.
export { isAdminAuthorized, isUnusableAdminToken } from "./admin-auth.js";

export interface ToolRegistrationOptions {
  adminToken: string;
}

/**
 * Registers all governance tools onto the given McpServer instance.
 * Called once during server construction.
 */
export function registerTools(
  server: McpServer,
  options: ToolRegistrationOptions
): void {
  registerPreflightTool(server);
  registerKillTool(server, options);
  registerReviveTool(server, options);
  registerStatusTool(server);
}
