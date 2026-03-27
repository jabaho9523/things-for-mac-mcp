#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerResources } from "./resources/lists.js";
import { registerPrompts } from "./prompts/workflows.js";

const server = new McpServer({
  name: "things-for-mac-mcp",
  version: "1.0.0",
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
}

main().catch((err) => {
  console.error("Failed to start Things MCP server:", err);
  process.exit(1);
});
