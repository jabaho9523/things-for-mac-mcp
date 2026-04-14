#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerResources } from "./resources/lists.js";
import { registerPrompts } from "./prompts/workflows.js";
import { checkForUpdate } from "./utils/update-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
) as { version: string };

const server = new McpServer({
  name: "things-for-mac-mcp",
  version: pkg.version,
  description:
    "A powerful MCP server for Things 3 on macOS — with AppleScript-powered writes, analytics, and workflow tools",
});

// Register all capabilities
registerReadTools(server);
registerWriteTools(server);
registerAnalyticsTools(server);
registerWorkflowTools(server);
registerResources(server);
registerPrompts(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Fire-and-forget update check. Never blocks startup; errors are swallowed
  // inside checkForUpdate, but defensive .catch in case.
  checkForUpdate(pkg.version).catch(() => {});
}

main().catch((err) => {
  console.error("Failed to start Things MCP server:", err);
  process.exit(1);
});
