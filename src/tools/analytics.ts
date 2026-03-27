import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as db from "../adapters/database.js";
import {
  formatTodoList,
  formatStats,
  formatProjectProgress,
} from "../utils/formatting.js";

export function registerAnalyticsTools(server: McpServer): void {
  server.tool(
    "get_statistics",
    "Get productivity statistics: completion counts, inbox size, overdue count, average completion time",
    {},
    async () => ({
      content: [{ type: "text", text: formatStats(db.getStatistics()) }],
    })
  );

  server.tool(
    "get_overdue",
    "Get todos that are past their deadline",
    {},
    async () => ({
      content: [{ type: "text", text: formatTodoList(db.getOverdue()) }],
    })
  );

  server.tool(
    "get_stale_items",
    "Get todos not updated in a long time",
    {
      days_stale: z
        .number()
        .optional()
        .describe("Number of days without update to consider stale (default: 14)"),
    },
    async ({ days_stale }) => ({
      content: [
        {
          type: "text",
          text: formatTodoList(db.getStaleItems(days_stale ?? 14)),
        },
      ],
    })
  );

  server.tool(
    "get_project_progress",
    "Get completion progress for all active projects",
    {},
    async () => ({
      content: [
        { type: "text", text: formatProjectProgress(db.getProjectProgress()) },
      ],
    })
  );
}
