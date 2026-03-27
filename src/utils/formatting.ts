import type { TodoRow, ProjectRow, AreaRow, TagRow, HeadingRow, ProjectProgress, StatsResult, WeeklyReviewData } from "../adapters/database.js";

export function formatTodo(t: TodoRow): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: t.uuid,
    title: t.title,
  };
  if (t.notes) result.notes = t.notes;
  if (t.tags) result.tags = t.tags.split(",");
  if (t.startDate) result.scheduledDate = t.startDate;
  if (t.deadline) result.deadline = t.deadline;
  if (t.stopDate) result.completedDate = t.stopDate;
  if (t.projectTitle) result.project = t.projectTitle;
  if (t.areaTitle) result.area = t.areaTitle;
  if (t.checklistCount > 0) {
    result.checklist = `${t.checklistCompletedCount}/${t.checklistCount}`;
  }
  result.status = statusLabel(t.status);
  return result;
}

export function formatTodoList(todos: TodoRow[]): string {
  if (todos.length === 0) return "No items found.";
  return JSON.stringify(todos.map(formatTodo), null, 2);
}

export function formatProject(p: ProjectRow): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: p.uuid,
    title: p.title,
    status: statusLabel(p.status),
    todoCount: p.todoCount,
    completedTodoCount: p.completedTodoCount,
  };
  if (p.notes) result.notes = p.notes;
  if (p.tags) result.tags = p.tags.split(",");
  if (p.areaTitle) result.area = p.areaTitle;
  if (p.deadline) result.deadline = p.deadline;
  return result;
}

export function formatProjectList(projects: ProjectRow[]): string {
  if (projects.length === 0) return "No projects found.";
  return JSON.stringify(projects.map(formatProject), null, 2);
}

export function formatArea(a: AreaRow): Record<string, unknown> {
  return { id: a.uuid, title: a.title };
}

export function formatAreaList(areas: AreaRow[]): string {
  if (areas.length === 0) return "No areas found.";
  return JSON.stringify(areas.map(formatArea), null, 2);
}

export function formatTag(t: TagRow): Record<string, unknown> {
  return { id: t.uuid, title: t.title };
}

export function formatTagList(tags: TagRow[]): string {
  if (tags.length === 0) return "No tags found.";
  return JSON.stringify(tags.map(formatTag), null, 2);
}

export function formatHeading(h: HeadingRow): Record<string, unknown> {
  return { id: h.uuid, title: h.title, project: h.projectTitle };
}

export function formatHeadingList(headings: HeadingRow[]): string {
  if (headings.length === 0) return "No headings found.";
  return JSON.stringify(headings.map(formatHeading), null, 2);
}

export function formatProjectProgress(pp: ProjectProgress[]): string {
  if (pp.length === 0) return "No active projects.";
  return JSON.stringify(
    pp.map((p) => ({
      title: p.title,
      progress: `${p.completedTodos}/${p.totalTodos} (${p.percentComplete}%)`,
      area: p.areaTitle ?? "None",
    })),
    null,
    2
  );
}

export function formatStats(s: StatsResult): string {
  return JSON.stringify(
    {
      tasks: {
        open: s.totalOpen,
        completed: s.totalCompleted,
        canceled: s.totalCanceled,
      },
      recent: {
        completedToday: s.completedToday,
        completedThisWeek: s.completedThisWeek,
      },
      inboxCount: s.inboxCount,
      overdueCount: s.overdueCount,
      avgCompletionDays: s.avgCompletionDays,
      counts: {
        projects: s.projectCount,
        areas: s.areaCount,
        tags: s.tagCount,
      },
    },
    null,
    2
  );
}

export function formatWeeklyReview(data: WeeklyReviewData): string {
  const sections: string[] = [];

  sections.push(`# Weekly Review\n`);
  sections.push(`## Statistics\n${formatStats(data.stats)}\n`);
  sections.push(
    `## Completed This Week (${data.completedThisWeek.length} items)\n${formatTodoList(data.completedThisWeek)}\n`
  );

  if (data.overdue.length > 0) {
    sections.push(
      `## Overdue (${data.overdue.length} items)\n${formatTodoList(data.overdue)}\n`
    );
  }

  if (data.staleItems.length > 0) {
    sections.push(
      `## Stale Items (not updated in 14+ days: ${data.staleItems.length} items)\n${formatTodoList(data.staleItems)}\n`
    );
  }

  sections.push(`## Inbox: ${data.inboxCount} items waiting\n`);
  sections.push(
    `## Project Progress\n${formatProjectProgress(data.projectProgress)}\n`
  );

  return sections.join("\n");
}

export function formatExport(
  todos: TodoRow[],
  format: "json" | "markdown" | "csv"
): string {
  if (format === "json") {
    return JSON.stringify(todos.map(formatTodo), null, 2);
  }
  if (format === "markdown") {
    return todos
      .map((t) => {
        const check = t.status === 3 ? "x" : " ";
        const extra: string[] = [];
        if (t.deadline) extra.push(`due: ${t.deadline}`);
        if (t.projectTitle) extra.push(`project: ${t.projectTitle}`);
        if (t.tags) extra.push(`tags: ${t.tags}`);
        const suffix = extra.length > 0 ? ` (${extra.join(", ")})` : "";
        return `- [${check}] ${t.title}${suffix}`;
      })
      .join("\n");
  }
  // CSV
  const header = "id,title,status,deadline,project,area,tags";
  const rows = todos.map(
    (t) =>
      `"${t.uuid}","${escapeCsv(t.title)}","${statusLabel(t.status)}","${t.deadline ?? ""}","${t.projectTitle ?? ""}","${t.areaTitle ?? ""}","${t.tags ?? ""}"`
  );
  return [header, ...rows].join("\n");
}

function statusLabel(status: number): string {
  switch (status) {
    case 0:
      return "open";
    case 2:
      return "canceled";
    case 3:
      return "completed";
    default:
      return "unknown";
  }
}

function escapeCsv(s: string): string {
  return s.replace(/"/g, '""');
}
