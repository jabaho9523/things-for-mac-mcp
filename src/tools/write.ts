import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as as from "../adapters/applescript.js";
import * as url from "../adapters/urlscheme.js";

export function registerWriteTools(server: McpServer): void {
  server.tool(
    "add_todo",
    "Create a new todo in Things. Use 'when' for natural scheduling: 'today', 'tomorrow', 'evening', 'anytime', 'someday', a date string 'YYYY-MM-DD', or 'YYYY-MM-DD@HH:MM' to include a reminder.",
    {
      title: z.string().describe("Todo title"),
      notes: z.string().optional().describe("Notes/description"),
      when: z
        .string()
        .optional()
        .describe(
          "Schedule: 'today', 'tomorrow', 'evening', 'anytime', 'someday', 'YYYY-MM-DD', or 'YYYY-MM-DD@HH:MM'"
        ),
      deadline: z.string().optional().describe("Deadline date (YYYY-MM-DD)"),
      tags: z.array(z.string()).optional().describe("Tag names to apply"),
      list: z.string().optional().describe("Target list or project name"),
      heading: z.string().optional().describe("Heading within a project"),
      checklist_items: z
        .array(z.string())
        .optional()
        .describe("Checklist items to add"),
    },
    async (params) => {
      // Use URL scheme for full parameter support (when, checklist, heading)
      await url.addTodoViaUrl({
        title: params.title,
        notes: params.notes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags,
        list: params.list,
        heading: params.heading,
        "checklist-items": params.checklist_items,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created todo: "${params.title}"${params.list ? ` in ${params.list}` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "add_project",
    "Create a new project, optionally with initial todos and headings using JSON structure",
    {
      title: z.string().describe("Project title"),
      notes: z.string().optional().describe("Project notes"),
      area: z.string().optional().describe("Area name to place the project in"),
      when: z.string().optional().describe("Schedule: 'today', 'someday', or date"),
      deadline: z.string().optional().describe("Deadline date (YYYY-MM-DD)"),
      tags: z.array(z.string()).optional().describe("Tag names"),
      items: z
        .array(
          z.object({
            type: z.enum(["to-do", "heading"]).describe("Item type"),
            title: z.string().describe("Item title"),
            notes: z.string().optional(),
            when: z.string().optional(),
            deadline: z.string().optional(),
            tags: z.array(z.string()).optional(),
            checklist_items: z
              .array(z.object({ title: z.string(), completed: z.boolean().optional() }))
              .optional(),
          })
        )
        .optional()
        .describe("Initial todos and headings within the project"),
    },
    async (params) => {
      await url.addProjectWithJson({
        title: params.title,
        notes: params.notes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags,
        items: params.items?.map((item) => ({
          type: item.type,
          title: item.title,
          notes: item.notes,
          when: item.when,
          deadline: item.deadline,
          tags: item.tags,
          "checklist-items": item.checklist_items,
        })),
      });
      return {
        content: [
          {
            type: "text",
            text: `Created project: "${params.title}"${params.items ? ` with ${params.items.length} items` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_todo",
    "Update an existing todo's properties",
    {
      id: z.string().describe("Todo UUID"),
      title: z.string().optional().describe("New title"),
      notes: z.string().optional().describe("Replace notes"),
      append_notes: z.string().optional().describe("Append to existing notes"),
      when: z.string().optional().describe("Reschedule"),
      deadline: z.string().optional().describe("New deadline"),
      tags: z.array(z.string()).optional().describe("Replace all tags"),
      add_tags: z.array(z.string()).optional().describe("Add tags without removing existing"),
      completed: z.boolean().optional().describe("Mark as completed"),
      canceled: z.boolean().optional().describe("Mark as canceled"),
      checklist_items: z.array(z.string()).optional().describe("Add checklist items"),
    },
    async (params) => {
      await url.updateTodoViaUrl(params.id, {
        title: params.title,
        notes: params.notes,
        "append-notes": params.append_notes,
        when: params.when,
        deadline: params.deadline,
        tags: params.tags,
        "add-tags": params.add_tags,
        completed: params.completed,
        canceled: params.canceled,
        "checklist-items": params.checklist_items,
      });
      return {
        content: [
          { type: "text", text: `Updated todo ${params.id}` },
        ],
      };
    }
  );

  // ── AppleScript-powered operations (not possible with URL scheme) ──

  server.tool(
    "complete_items",
    "Mark one or more todos as completed (via AppleScript)",
    {
      todo_ids: z.array(z.string()).describe("Array of todo UUIDs to complete"),
    },
    async ({ todo_ids }) => {
      if (todo_ids.length === 1) {
        await as.completeTodoById(todo_ids[0]!);
        return {
          content: [{ type: "text", text: `Completed todo ${todo_ids[0]}` }],
        };
      }
      const result = await as.batchComplete(todo_ids);
      return {
        content: [
          {
            type: "text",
            text: `Completed ${result.completed.length} todos.${result.notFound.length > 0 ? ` Not found: ${result.notFound.join(", ")}` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "cancel_items",
    "Mark one or more todos as canceled (via AppleScript)",
    {
      todo_ids: z.array(z.string()).describe("Array of todo UUIDs to cancel"),
    },
    async ({ todo_ids }) => {
      for (const id of todo_ids) {
        await as.cancelTodoById(id);
      }
      return {
        content: [
          { type: "text", text: `Canceled ${todo_ids.length} todo(s).` },
        ],
      };
    }
  );

  server.tool(
    "delete_items",
    "Move one or more todos to Trash (via AppleScript)",
    {
      todo_ids: z.array(z.string()).describe("Array of todo UUIDs to trash"),
    },
    async ({ todo_ids }) => {
      for (const id of todo_ids) {
        await as.deleteTodoById(id);
      }
      return {
        content: [
          { type: "text", text: `Trashed ${todo_ids.length} todo(s).` },
        ],
      };
    }
  );

  server.tool(
    "move_todo",
    "Move a todo to a different project or list (via AppleScript)",
    {
      todo_id: z.string().describe("Todo UUID to move"),
      target_project: z
        .string()
        .optional()
        .describe("Target project name (move into this project)"),
      target_list: z
        .string()
        .optional()
        .describe(
          "Target list name: 'Inbox', 'Today', 'Anytime', 'Someday'"
        ),
    },
    async ({ todo_id, target_project, target_list }) => {
      if (target_project) {
        await as.moveTodoToProject(todo_id, target_project);
        return {
          content: [
            {
              type: "text",
              text: `Moved todo to project "${target_project}"`,
            },
          ],
        };
      }
      if (target_list) {
        await as.moveTodoToList(todo_id, target_list);
        return {
          content: [
            { type: "text", text: `Moved todo to list "${target_list}"` },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: "Please specify either target_project or target_list.",
          },
        ],
        isError: true,
      };
    }
  );

  server.tool(
    "batch_move",
    "Move multiple todos to a project (via AppleScript)",
    {
      todo_ids: z.array(z.string()).describe("Todo UUIDs to move"),
      project_name: z.string().describe("Target project name"),
    },
    async ({ todo_ids, project_name }) => {
      const result = await as.batchMoveToProject(todo_ids, project_name);
      return {
        content: [
          {
            type: "text",
            text: `Moved ${result.moved.length} todos to "${project_name}".${result.notFound.length > 0 ? ` Not found: ${result.notFound.join(", ")}` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "batch_tag",
    "Apply tags to multiple todos (via AppleScript)",
    {
      todo_ids: z.array(z.string()).describe("Todo UUIDs to tag"),
      tag_names: z.array(z.string()).describe("Tags to set on these todos"),
    },
    async ({ todo_ids, tag_names }) => {
      const result = await as.batchTag(todo_ids, tag_names);
      return {
        content: [
          {
            type: "text",
            text: `Tagged ${result.tagged.length} todos.${result.notFound.length > 0 ? ` Not found: ${result.notFound.join(", ")}` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "create_area",
    "Create a new area (via AppleScript)",
    { name: z.string().describe("Area name") },
    async ({ name }) => {
      const id = await as.createArea(name);
      return {
        content: [
          { type: "text", text: `Created area "${name}" with ID: ${id}` },
        ],
      };
    }
  );

  server.tool(
    "create_tag",
    "Create a new tag (via AppleScript)",
    { name: z.string().describe("Tag name") },
    async ({ name }) => {
      const id = await as.createTag(name);
      return {
        content: [
          { type: "text", text: `Created tag "${name}" with ID: ${id}` },
        ],
      };
    }
  );

  // ── Navigation tools ──

  server.tool(
    "show_item",
    "Show a specific item or list in Things UI",
    {
      id: z
        .string()
        .describe(
          "Item UUID or built-in list name (inbox, today, upcoming, anytime, someday, logbook, trash)"
        ),
    },
    async ({ id }) => {
      await url.showInThings(id);
      return {
        content: [{ type: "text", text: `Showing ${id} in Things.` }],
      };
    }
  );

  server.tool(
    "search_in_things",
    "Trigger a search in the Things UI",
    { query: z.string().describe("Search query") },
    async ({ query }) => {
      await url.searchInThings(query);
      return {
        content: [
          { type: "text", text: `Searching for "${query}" in Things.` },
        ],
      };
    }
  );
}
