import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Build and open a Things URL scheme command.
 * Used as fallback for operations where AppleScript is less convenient
 * (e.g., add-json for complex project structures with checklists).
 */
export async function openThingsUrl(
  command: string,
  params: Record<string, string>
): Promise<void> {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `things:////${command}?${query}`;
  await execFileAsync("osascript", [
    "-e",
    `open location "${url.replace(/"/g, '\\"')}"`,
  ]);
}

/**
 * Create a complex project with todos and headings using JSON.
 * This is more powerful than AppleScript for structured project creation.
 */
export async function addProjectWithJson(json: {
  title: string;
  notes?: string;
  "area-id"?: string;
  when?: string;
  deadline?: string;
  tags?: string[];
  items?: Array<{
    type: "to-do" | "heading";
    title: string;
    notes?: string;
    when?: string;
    deadline?: string;
    tags?: string[];
    "checklist-items"?: Array<{ title: string; completed?: boolean }>;
  }>;
}): Promise<void> {
  await openThingsUrl("add-json", {
    data: JSON.stringify([json]),
    reveal: "true",
  });
}

/**
 * Add a todo with full URL scheme parameters including checklist items.
 */
export async function addTodoViaUrl(params: {
  title: string;
  notes?: string;
  when?: string;
  deadline?: string;
  tags?: string[];
  list?: string;
  "list-id"?: string;
  heading?: string;
  "checklist-items"?: string[];
  completed?: boolean;
  canceled?: boolean;
}): Promise<void> {
  const urlParams: Record<string, string> = {
    title: params.title,
    "reveal": "true",
  };
  if (params.notes) urlParams["notes"] = params.notes;
  if (params.when) urlParams["when"] = params.when;
  if (params.deadline) urlParams["deadline"] = params.deadline;
  if (params.tags) urlParams["tags"] = params.tags.join(",");
  if (params.list) urlParams["list"] = params.list;
  if (params["list-id"]) urlParams["list-id"] = params["list-id"];
  if (params.heading) urlParams["heading"] = params.heading;
  if (params["checklist-items"])
    urlParams["checklist-items"] = params["checklist-items"].join("\n");
  if (params.completed) urlParams["completed"] = "true";
  if (params.canceled) urlParams["canceled"] = "true";

  await openThingsUrl("add", urlParams);
}

/**
 * Update an existing todo via URL scheme (requires auth-token for some properties).
 */
export async function updateTodoViaUrl(
  id: string,
  params: {
    title?: string;
    notes?: string;
    when?: string;
    deadline?: string;
    tags?: string[];
    completed?: boolean;
    canceled?: boolean;
    "prepend-notes"?: string;
    "append-notes"?: string;
    "add-tags"?: string[];
    "checklist-items"?: string[];
    "prepend-checklist-items"?: string[];
    "append-checklist-items"?: string[];
  },
  authToken?: string
): Promise<void> {
  const urlParams: Record<string, string> = { id };
  if (authToken) urlParams["auth-token"] = authToken;
  if (params.title) urlParams["title"] = params.title;
  if (params.notes) urlParams["notes"] = params.notes;
  if (params.when) urlParams["when"] = params.when;
  if (params.deadline) urlParams["deadline"] = params.deadline;
  if (params.tags) urlParams["tags"] = params.tags.join(",");
  if (params.completed) urlParams["completed"] = "true";
  if (params.canceled) urlParams["canceled"] = "true";
  if (params["prepend-notes"])
    urlParams["prepend-notes"] = params["prepend-notes"];
  if (params["append-notes"])
    urlParams["append-notes"] = params["append-notes"];
  if (params["add-tags"]) urlParams["add-tags"] = params["add-tags"].join(",");
  if (params["checklist-items"])
    urlParams["checklist-items"] = params["checklist-items"].join("\n");

  await openThingsUrl("update", urlParams);
}

/**
 * Show a specific item or list in Things.
 */
export async function showInThings(
  idOrList: string
): Promise<void> {
  const builtInLists = [
    "inbox",
    "today",
    "upcoming",
    "anytime",
    "someday",
    "logbook",
    "trash",
  ];
  if (builtInLists.includes(idOrList.toLowerCase())) {
    await openThingsUrl("show", { id: idOrList.toLowerCase() });
  } else {
    await openThingsUrl("show", { id: idOrList });
  }
}

/**
 * Trigger a search in Things UI.
 */
export async function searchInThings(query: string): Promise<void> {
  await openThingsUrl("search", { query });
}
