import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as db from "../adapters/database.js";
import { formatWeeklyReview, formatExport } from "../utils/formatting.js";

export function registerWorkflowTools(server: McpServer): void {
  server.tool(
    "weekly_review",
    "Generate a comprehensive weekly review: completed items, overdue, stale tasks, inbox count, and project progress",
    {},
    async () => ({
      content: [
        { type: "text", text: formatWeeklyReview(db.getWeeklyReviewData()) },
      ],
    })
  );

  server.tool(
    "export_list",
    "Export a list of todos in JSON, Markdown, or CSV format",
    {
      list: z
        .enum([
          "inbox",
          "today",
          "upcoming",
          "anytime",
          "someday",
          "logbook",
          "all_open",
        ])
        .describe("Which list to export"),
      format: z
        .enum(["json", "markdown", "csv"])
        .describe("Export format"),
      days_back: z
        .number()
        .optional()
        .describe("For logbook: how many days back (default: 30)"),
    },
    async ({ list, format, days_back }) => {
      let todos: db.TodoRow[];
      switch (list) {
        case "inbox":
          todos = db.getInbox();
          break;
        case "today":
          todos = db.getToday();
          break;
        case "upcoming":
          todos = db.getUpcoming();
          break;
        case "anytime":
          todos = db.getAnytime();
          break;
        case "someday":
          todos = db.getSomeday();
          break;
        case "logbook":
          todos = db.getLogbook(days_back ?? 30);
          break;
        case "all_open":
          todos = db.getTodos();
          break;
      }
      return {
        content: [{ type: "text", text: formatExport(todos, format) }],
      };
    }
  );
}
