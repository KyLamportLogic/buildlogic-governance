import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, isUnusableAdminToken } from "./tools/index.js";

export interface GovernanceMcpServerOptions {
  name?: string;
  version?: string;
  /**
   * Bearer token required by governance/kill and governance/revive tools.
   * Falls back to the AGENT_ADMIN_TOKEN env var. There is no default: a
   * missing or placeholder token fails closed at construction time.
   */
  adminToken?: string;
}

/**
 * Factory — creates and wires a McpServer with all governance tools registered.
 * Caller is responsible for connecting the supported stdio transport.
 *
 * @example
 * const server = createGovernanceMcpServer();
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 */
export function createGovernanceMcpServer(
  options: GovernanceMcpServerOptions = {}
): McpServer {
  const server = new McpServer({
    name: options.name ?? "buildlogic-governance",
    version: options.version ?? "0.1.0",
  });

  const adminToken = (options.adminToken ?? process.env.AGENT_ADMIN_TOKEN ?? "").trim();

  if (isUnusableAdminToken(adminToken)) {
    throw new Error(
      "AGENT_ADMIN_TOKEN is required to start the governance MCP server. " +
        "Set it to a long random secret (or pass options.adminToken); " +
        "placeholder values are rejected so kill/revive cannot be driven by a known default."
    );
  }

  registerTools(server, { adminToken });

  return server;
}
