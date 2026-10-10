#!/usr/bin/env node
/**
 * Default entry point — starts the governance MCP server on stdio.
 * This is what runs when the package is invoked as a CLI binary.
 */
import { startStdio } from "./transports/stdio.js";

await startStdio();
