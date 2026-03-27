import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "weekly_review",
    "Guide through a comprehensive weekly review of your Things 3 tasks",
    {},
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please help me with my weekly review. Follow these steps:

1. First, call the \`weekly_review\` tool to get an overview of my week.
2. Analyze the results and highlight:
   - My productivity this week (completed items vs previous trends)
   - Any overdue items that need immediate attention
   - Stale items that I should either do, delegate, or delete
   - Inbox items that need to be processed and organized
   - Projects that are stalled or nearly complete
3. For each area of concern, suggest concrete next actions.
4. Ask me if I'd like to process any of these items (move, complete, reschedule, or delete).

Be concise and actionable in your review.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "daily_planning",
    "Plan your day by reviewing today's tasks and suggesting priorities",
    {},
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help me plan my day. Please:

1. Call \`get_today\` to see what's scheduled for today.
2. Call \`get_overdue\` to check for overdue items.
3. Call \`get_inbox\` to see if there are unprocessed items.
4. Based on this, suggest a prioritized plan for my day:
   - What should I tackle first?
   - Any overdue items that are urgent?
   - Should any inbox items be scheduled for today?
5. Ask if I'd like to make any changes (reschedule, move items to today, etc.).`,
          },
        },
      ],
    })
  );

  server.prompt(
    "project_breakdown",
    "Break down a goal into a structured Things 3 project",
    { goal: z.string().describe("The goal or project to break down") },
    async ({ goal }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help me break down this goal into a structured Things 3 project: "${goal}"

Please:
1. First, call \`get_areas\` and \`get_tags\` to understand my existing organizational structure.
2. Suggest a project structure with:
   - A clear project title
   - Logical headings to group tasks
   - Specific, actionable todos under each heading
   - Suggested tags from my existing tags
   - Reasonable deadlines if applicable
   - Which area it should belong to
3. Present the plan and ask for my approval before creating it.
4. Once approved, use \`add_project\` to create the entire structure.`,
          },
        },
      ],
    })
  );
}
