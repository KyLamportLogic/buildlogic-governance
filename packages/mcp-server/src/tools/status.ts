import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkKillSwitch, loadGovernancePolicy } from "@kypython/buildlogic-governance";

/**
 * Tool: governance/status
 *
 * Returns the current governance policy state: kill switch flag, policy settings,
 * and server version. Safe to call at any time — read-only, no side effects.
 */
export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    "governance/status",
    {
      title: "Governance Status",
      description:
        "Read current kill switch state and active policy settings. " +
        "Use before invoking any action to confirm governance is live.",
      inputSchema: {},
    },
    async () => {
      const killSwitch = checkKillSwitch();
      const policy = loadGovernancePolicy();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                killSwitchActive: killSwitch.active,
                killSwitchReason: killSwitch.reason,
                policy: {
                  requireContracts: policy.requireContracts,
                  maxRiskLevel: policy.maxRiskLevel,
                  restrictedActions: Array.from(policy.restrictedActions),
                  parallelPreflightChecks: policy.parallelPreflightChecks,
                },
                version: "0.1.0",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
