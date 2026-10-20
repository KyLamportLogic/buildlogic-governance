# @kypython/buildlogic-mcp-governance

A local stdio MCP server exposing deterministic governance preflight, status, kill, and revive tools.

```sh
npm install --global @kypython/buildlogic-mcp-governance
AGENT_ADMIN_TOKEN='a-long-random-secret' buildlogic-governance-mcp
```

The server refuses to start without a non-placeholder admin token. `governance/kill` and `governance/revive` require that token; status and preflight remain read-only. The MCP wrapper does not replace call-site gating around the mutation itself.

Programmatic use:

```ts
import { createGovernanceMcpServer } from '@kypython/buildlogic-mcp-governance/server';

const server = createGovernanceMcpServer({
  adminToken: process.env.AGENT_ADMIN_TOKEN,
});
```

Only stdio transport is supported in version `0.1.0`. Remote HTTP transport is intentionally unavailable.
