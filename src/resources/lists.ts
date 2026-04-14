import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as db from "../adapters/database.js";
import {
  formatTodoList,
  formatProjectList,
  formatAreaList,
  formatTagList,
} from "../utils/formatting.js";

export function registerResources(server: McpServer): void {
  // ── Static list resources ──

  const staticLists: Array<{
    name: string;
    uri: string;
    description: string;
    fetch: () => string;
  }> = [
    {
      name: "Inbox",
      uri: "things://inbox",
      description: "Things 3 Inbox",
      fetch: () => formatTodoList(db.getInbox()),
    },
    {
      name: "Today",
      uri: "things://today",
      description: "Things 3 Today list",
      fetch: () => formatTodoList(db.getToday()),
    },
    {
      name: "Upcoming",
      uri: "things://upcoming",
      description: "Things 3 Upcoming list",
      fetch: () => formatTodoList(db.getUpcoming()),
    },
    {
      name: "Anytime",
      uri: "things://anytime",
      description: "Things 3 Anytime list",
      // Resources represent the full list; bypass the default tool limit.
      fetch: () => formatTodoList(db.getAnytime(Number.MAX_SAFE_INTEGER)),
    },
    {
      name: "Someday",
      uri: "things://someday",
      description: "Things 3 Someday list",
      fetch: () => formatTodoList(db.getSomeday()),
    },
    {
      name: "All Projects",
      uri: "things://projects",
      description: "All active Things 3 projects",
      fetch: () => formatProjectList(db.getProjects()),
    },
    {
      name: "All Areas",
      uri: "things://areas",
      description: "All Things 3 areas",
      fetch: () => formatAreaList(db.getAreas()),
    },
    {
      name: "All Tags",
      uri: "things://tags",
      description: "All Things 3 tags",
      fetch: () => formatTagList(db.getTags()),
    },
  ];

  for (const list of staticLists) {
    server.resource(list.name, list.uri, { description: list.description }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: list.fetch() }],
    }));
  }

  // ── Resource template for project todos ──

  server.resource(
    "project_todos",
    new ResourceTemplate("things://project/{projectId}", { list: undefined }),
    { description: "Todos within a specific project" },
    async (uri, params) => {
      const projectId = params.projectId as string;
      const todos = db.getTodos(projectId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: formatTodoList(todos),
          },
        ],
      };
    }
  );
}
