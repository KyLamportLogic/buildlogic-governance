import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGovernanceMcpServer } from "../server.js";

/**
 * Stdio entry point — use this when wiring the server into Claude Code,
 * Cursor, or any MCP client that communicates over stdin/stdout.
 *
 * Add to .mcp.json:
 *   {
 *     "mcpServers": {
 *       "governance": {
 *         "command": "buildlogic-governance-mcp",
 *         "env": { "AGENT_ADMIN_TOKEN": "..." }
 *       }
 *     }
 *   }
 */
export async function startStdio(): Promise<void> {
  const server = createGovernanceMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
