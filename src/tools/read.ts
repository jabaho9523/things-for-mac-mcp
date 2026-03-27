import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as db from "../adapters/database.js";
import {
  formatTodoList,
  formatProjectList,
  formatAreaList,
  formatTagList,
  formatHeadingList,
} from "../utils/formatting.js";

export function registerReadTools(server: McpServer): void {
  server.tool("get_inbox", "Get all todos in the Inbox", {}, async () => ({
    content: [{ type: "text", text: formatTodoList(db.getInbox()) }],
  }));

  server.tool("get_today", "Get todos scheduled for Today", {}, async () => ({
    content: [{ type: "text", text: formatTodoList(db.getToday()) }],
  }));

  server.tool("get_upcoming", "Get upcoming scheduled todos", {}, async () => ({
    content: [{ type: "text", text: formatTodoList(db.getUpcoming()) }],
  }));

  server.tool(
    "get_anytime",
    "Get todos in the Anytime list (excludes Someday projects)",
    {},
    async () => ({
      content: [{ type: "text", text: formatTodoList(db.getAnytime()) }],
    })
  );

  server.tool(
    "get_someday",
    "Get todos in the Someday list",
    {},
    async () => ({
      content: [{ type: "text", text: formatTodoList(db.getSomeday()) }],
    })
  );

  server.tool(
    "get_logbook",
    "Get completed todos from the logbook",
    { days_back: z.number().optional().describe("Number of days back to look (default: 7)") },
    async ({ days_back }) => ({
      content: [
        { type: "text", text: formatTodoList(db.getLogbook(days_back ?? 7)) },
      ],
    })
  );

  server.tool("get_trash", "Get trashed items", {}, async () => ({
    content: [{ type: "text", text: formatTodoList(db.getTrash()) }],
  }));

  server.tool(
    "get_todos",
    "Get all open todos, optionally filtered by project ID",
    {
      project_id: z.string().optional().describe("Filter by project UUID"),
    },
    async ({ project_id }) => ({
      content: [
        { type: "text", text: formatTodoList(db.getTodos(project_id)) },
      ],
    })
  );

  server.tool(
    "get_projects",
    "Get all projects",
    {
      include_completed: z
        .boolean()
        .optional()
        .describe("Include completed projects (default: false)"),
    },
    async ({ include_completed }) => ({
      content: [
        {
          type: "text",
          text: formatProjectList(db.getProjects(include_completed ?? false)),
        },
      ],
    })
  );

  server.tool("get_areas", "Get all areas", {}, async () => ({
    content: [{ type: "text", text: formatAreaList(db.getAreas()) }],
  }));

  server.tool("get_tags", "Get all tags", {}, async () => ({
    content: [{ type: "text", text: formatTagList(db.getTags()) }],
  }));

  server.tool(
    "get_headings",
    "Get headings, optionally filtered by project",
    {
      project_id: z.string().optional().describe("Filter by project UUID"),
    },
    async ({ project_id }) => ({
      content: [
        {
          type: "text",
          text: formatHeadingList(db.getHeadings(project_id)),
        },
      ],
    })
  );

  server.tool(
    "search_todos",
    "Search todos by title or notes",
    { query: z.string().describe("Search query") },
    async ({ query }) => ({
      content: [
        { type: "text", text: formatTodoList(db.searchTodos(query)) },
      ],
    })
  );

  server.tool(
    "search_advanced",
    "Search with multiple filters",
    {
      query: z.string().optional().describe("Text search in title/notes"),
      status: z
        .enum(["open", "completed", "canceled"])
        .optional()
        .describe("Filter by status"),
      tag: z.string().optional().describe("Filter by tag name"),
      area: z.string().optional().describe("Filter by area name"),
      project: z.string().optional().describe("Filter by project name"),
      type: z
        .enum(["todo", "project"])
        .optional()
        .describe("Filter by item type"),
      created_within_days: z
        .number()
        .optional()
        .describe("Items created within N days"),
    },
    async (filters) => ({
      content: [
        {
          type: "text",
          text: formatTodoList(
            db.searchAdvanced({
              query: filters.query,
              status: filters.status,
              tag: filters.tag,
              area: filters.area,
              project: filters.project,
              type: filters.type,
              createdWithinDays: filters.created_within_days,
            })
          ),
        },
      ],
    })
  );

  server.tool(
    "get_recent",
    "Get recently created items",
    {
      days_back: z
        .number()
        .optional()
        .describe("Number of days back (default: 3)"),
    },
    async ({ days_back }) => ({
      content: [
        { type: "text", text: formatTodoList(db.getRecent(days_back ?? 3)) },
      ],
    })
  );
}
