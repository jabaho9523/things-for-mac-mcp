import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`AppleScript execution failed: ${message}`);
  }
}

// ── Helpers to build common AppleScript commands for Things 3 ──

export function thingsScript(body: string): string {
  return `tell application "Things3"\n${body}\nend tell`;
}

// ── Utilities ──

/**
 * Escape a JS string for embedding in an AppleScript string literal.
 *
 * AppleScript literals accept no raw control characters, so a to-do note
 * containing a newline used to terminate the literal mid-script and fail with
 * a syntax error. AppleScript understands the same \n / \r / \t escapes as C.
 */
function escapeAS(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * AppleScript that binds `varName` to the to-do with `todoId`, or to
 * `missing value` when no such to-do exists.
 *
 * Every write helper used to locate its target by scanning the whole `to dos`
 * collection (`repeat with t in to dos / if id of t is …`). That was O(n) per
 * call over the user's entire library, and AppleScript re-resolves
 * `item N of to dos` on each iteration — so when Things mutated the collection
 * mid-scan (Cloud sync, reindexing) the scan died with
 * `Can't get item N of every to do. Invalid index. (-1719)`, or silently ran
 * off the end and reported a live to-do as "not found".
 *
 * Things exposes `to do id "…"` as a direct object specifier — already used by
 * `showItem` below — which has neither failure mode.
 *
 * The specifier is built lazily and only errors when something reads through
 * it, so `name of` is fetched to force resolution while the error is still
 * catchable.
 */
function resolveTodo(todoId: string, varName = "targetTodo"): string {
  const id = escapeAS(todoId);
  return `
    set ${varName} to missing value
    try
      set ${varName} to to do id "${id}"
      set _probe to name of ${varName}
    on error
      set ${varName} to missing value
    end try`;
}

/**
 * Like `resolveTodo`, but also looks in the Logbook.
 *
 * Things' top-level `to dos` collection — and `to do id` alongside it —
 * excludes completed and canceled items, so trashing one needs the explicit
 * second lookup. (Items already in the Trash aren't our concern.)
 */
function resolveTodoIncludingLogbook(
  todoId: string,
  varName = "targetTodo"
): string {
  const id = escapeAS(todoId);
  return `${resolveTodo(todoId, varName)}
    if ${varName} is missing value then
      try
        set ${varName} to to do id "${id}" of list "Logbook"
        set _probe to name of ${varName}
      on error
        set ${varName} to missing value
      end try
    end if`;
}

/** Where a to-do can live. Each kind needs a different AppleScript verb. */
type ContainerKind = "project" | "area" | "list";

const ALL_CONTAINER_KINDS: ContainerKind[] = ["project", "area", "list"];

/**
 * AppleScript that binds `targetContainer` to the project, area, or built-in
 * list named `name`, and `targetKind` to which of those it turned out to be
 * (empty string when nothing matched).
 *
 * Things models the three separately and there's no way to ask "what is this
 * name?" up front, so each is tried in turn. `kinds` sets the precedence:
 * `add_todo` prefers a project, while `move_todo`'s `target_list` prefers a
 * built-in list, matching what each parameter documents.
 */
function resolveContainer(
  name: string,
  kinds: ContainerKind[] = ALL_CONTAINER_KINDS
): string {
  const escaped = escapeAS(name);
  const attempt = (kind: ContainerKind, first: boolean): string => {
    const body = `
      try
        set targetContainer to ${kind} "${escaped}"
        set _probe to name of targetContainer
        set targetKind to "${kind}"
      on error
        set targetContainer to missing value
      end try`;
    return first
      ? body
      : `
    if targetContainer is missing value then${body}
    end if`;
  };
  return `
    set targetContainer to missing value
    set targetKind to ""
    ${kinds.map((kind, i) => attempt(kind, i === 0)).join("\n")}`;
}

/**
 * AppleScript that files an already-resolved to-do into an already-resolved
 * container.
 *
 * `move <to do> to project "X"` is what this server used to emit, and Things
 * rejects it with `Cannot move to-do (301)`: its `move` command takes a *list*,
 * which is why moving to Anytime or Someday always worked while every move
 * into a project failed. A to-do's `project` and `area` are ordinary mutable
 * properties instead — Cultured Code's own documentation reassigns them with
 * `delete project of theTodo` — so assignment is the supported route.
 */
function placeTodo(todoVar: string, containerVar = "targetContainer"): string {
  return `
    if targetKind is "project" then
      set project of ${todoVar} to ${containerVar}
    else if targetKind is "area" then
      set area of ${todoVar} to ${containerVar}
    else
      move ${todoVar} to ${containerVar}
    end if`;
}

function notFoundGuard(name: string): string {
  return `
    if targetKind is "" then error "No project, area, or list named \\"${escapeAS(
      name
    )}\\""`;
}

// ── Read helpers ──

export async function getListItems(
  listName: string
): Promise<{ id: string; name: string }[]> {
  const script = thingsScript(`
    set output to ""
    repeat with t in to dos of list "${escapeAS(listName)}"
      set output to output & (id of t) & "\\t" & (name of t) & "\\n"
    end repeat
    return output
  `);
  return parseIdNamePairs(await runAppleScript(script));
}

// ── Write helpers ──

/**
 * AppleScript that sets `due date of <todoVar>` from a `YYYY-MM-DD` string.
 *
 * `date "2026-09-01"` parses against the user's locale and throws on most
 * non-US systems, so the components are assigned individually. `day` is reset
 * to 1 before `month` so that setting the month from, say, the 31st can't
 * overflow into the next one.
 */
function setDueDate(todoVar: string, dueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate.trim());
  if (!match) {
    throw new Error(
      `Invalid deadline "${dueDate}" — expected YYYY-MM-DD (e.g. 2026-09-01).`
    );
  }
  const [, year, month, day] = match;
  return `
    set dueD to current date
    set day of dueD to 1
    set year of dueD to ${Number(year)}
    set month of dueD to ${Number(month)}
    set day of dueD to ${Number(day)}
    set time of dueD to 0
    set due date of ${todoVar} to dueD`;
}

export async function createTodo(props: {
  name: string;
  notes?: string;
  /** Project, area, or built-in list name. */
  listName?: string;
  tagNames?: string[];
  dueDate?: string;
}): Promise<string> {
  const propParts: string[] = [`name:"${escapeAS(props.name)}"`];
  if (props.notes) propParts.push(`notes:"${escapeAS(props.notes)}"`);
  const properties = `{${propParts.join(", ")}}`;

  const tagAssign =
    props.tagNames && props.tagNames.length > 0
      ? `\nset tag names of newTodo to "${props.tagNames
          .map(escapeAS)
          .join(",")}"`
      : "";

  const dueDateAssign = props.dueDate
    ? setDueDate("newTodo", props.dueDate)
    : "";

  // With no destination the to-do lands in the Inbox, same as Quick Entry.
  let creation = `set newTodo to make new to do with properties ${properties}`;

  if (props.listName) {
    // `make new to do with properties {…} of project "X"` — what this server
    // used to emit — isn't a valid `make` location specifier, and Things
    // rejected it with `AppleEvent handler failed. (-10000)`. `at end of` is
    // the real one. The destination was also hardcoded to `project`, so area
    // names failed with `Can't get project "…" (-1728)` even though the tool
    // documents `list` as accepting any of the three.
    creation = `${resolveContainer(props.listName)}
    ${notFoundGuard(props.listName)}
    try
      set newTodo to make new to do at end of targetContainer with properties ${properties}
    on error
      -- Older Things builds reject 'at end of' for some container kinds.
      -- Create it unfiled, then reuse the property assignment that move uses.
      set newTodo to make new to do with properties ${properties}
      ${placeTodo("newTodo")}
    end try`;
  }

  const script = thingsScript(`
    ${creation}${tagAssign}${dueDateAssign}
    return id of newTodo
  `);
  return runAppleScript(script);
}

export async function createProject(props: {
  name: string;
  notes?: string;
  areaName?: string;
  tagNames?: string[];
}): Promise<string> {
  const propParts: string[] = [`name:"${escapeAS(props.name)}"`];
  if (props.notes) propParts.push(`notes:"${escapeAS(props.notes)}"`);
  const properties = `{${propParts.join(", ")}}`;

  const tagAssign =
    props.tagNames && props.tagNames.length > 0
      ? `\nset tag names of newProj to "${props.tagNames
          .map(escapeAS)
          .join(",")}"`
      : "";

  let creation = `set newProj to make new project with properties ${properties}`;
  if (props.areaName) {
    const area = escapeAS(props.areaName);
    creation = `
    try
      set newProj to make new project at end of area "${area}" with properties ${properties}
    on error
      set newProj to make new project with properties ${properties}
      set area of newProj to area "${area}"
    end try`;
  }

  const script = thingsScript(`
    ${creation}${tagAssign}
    return id of newProj
  `);
  return runAppleScript(script);
}

export async function completeTodo(todoName: string): Promise<void> {
  const script = thingsScript(
    `set status of to do "${escapeAS(todoName)}" to completed`
  );
  await runAppleScript(script);
}

export async function completeTodoById(todoId: string): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    set status of targetTodo to completed
  `);
  await runAppleScript(script);
}

export async function cancelTodoById(todoId: string): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    set status of targetTodo to canceled
  `);
  await runAppleScript(script);
}

export async function deleteTodoById(todoId: string): Promise<void> {
  const script = thingsScript(`
    ${resolveTodoIncludingLogbook(todoId)}
    if targetTodo is missing value then error "Todo not found"
    move targetTodo to list "Trash"
  `);
  await runAppleScript(script);
}

export async function moveTodoToProject(
  todoId: string,
  projectName: string
): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    ${resolveContainer(projectName, ["project"])}
    if targetKind is "" then error "No project named \\"${escapeAS(
      projectName
    )}\\""
    ${placeTodo("targetTodo")}
  `);
  await runAppleScript(script);
}

export async function moveTodoToArea(
  todoId: string,
  areaName: string
): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    ${resolveContainer(areaName, ["area"])}
    if targetKind is "" then error "No area named \\"${escapeAS(areaName)}\\""
    ${placeTodo("targetTodo")}
  `);
  await runAppleScript(script);
}

/**
 * Move a to-do to `listName`, which may be a built-in list ("Anytime",
 * "Someday", …), an area, or a project — resolved in that order.
 */
export async function moveTodoToList(
  todoId: string,
  listName: string
): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    ${resolveContainer(listName, ["list", "area", "project"])}
    ${notFoundGuard(listName)}
    ${placeTodo("targetTodo")}
  `);
  await runAppleScript(script);
}

export async function setTagsOnTodo(
  todoId: string,
  tagNames: string[]
): Promise<void> {
  const script = thingsScript(`
    ${resolveTodo(todoId)}
    if targetTodo is missing value then error "Todo not found"
    set tag names of targetTodo to "${tagNames.map(escapeAS).join(",")}"
  `);
  await runAppleScript(script);
}

export async function createArea(name: string): Promise<string> {
  const script = thingsScript(`
    set newArea to make new area with properties {name:"${escapeAS(name)}"}
    return id of newArea
  `);
  return runAppleScript(script);
}

export async function createTag(name: string): Promise<string> {
  const script = thingsScript(`
    set newTag to make new tag with properties {name:"${escapeAS(name)}"}
    return id of newTag
  `);
  return runAppleScript(script);
}

export async function showItem(id: string): Promise<void> {
  const script = thingsScript(`show to do id "${escapeAS(id)}"`);
  await runAppleScript(script);
}

export async function showList(name: string): Promise<void> {
  const script = thingsScript(`show list "${escapeAS(name)}"`);
  await runAppleScript(script);
}

// ── Batch helpers ──

export interface BatchResult {
  succeeded: string[];
  notFound: string[];
}

/**
 * Run `action` against every to-do in `todoIds` in a single osascript call,
 * reporting which ids resolved.
 *
 * `action` is AppleScript operating on the variable `targetTodo`; `prelude`
 * runs once before the loop (used to resolve a shared destination).
 */
function buildBatchScript(
  todoIds: string[],
  action: string,
  prelude = ""
): string {
  const idList = todoIds.map((id) => `"${escapeAS(id)}"`).join(", ");
  return thingsScript(`
    ${prelude}
    set idList to {${idList}}
    set okIds to ""
    set missingIds to ""
    repeat with rawId in idList
      -- 'repeat with x in someList' binds a reference to the list item,
      -- not the string in it. Comparing and concatenating that reference is
      -- what made batch calls report live to-dos as not found;
      -- 'contents of' dereferences it.
      set targetId to contents of rawId
      set targetTodo to missing value
      try
        set targetTodo to to do id targetId
        set _probe to name of targetTodo
      on error
        set targetTodo to missing value
      end try
      if targetTodo is missing value then
        set missingIds to missingIds & targetId & ","
      else
        ${action}
        set okIds to okIds & targetId & ","
      end if
    end repeat
    return okIds & "|" & missingIds
  `);
}

async function runBatch(script: string): Promise<BatchResult> {
  const result = await runAppleScript(script);
  const [okStr, missingStr] = result.split("|");
  return {
    succeeded: parseCommaSep(okStr),
    notFound: parseCommaSep(missingStr),
  };
}

export async function batchComplete(todoIds: string[]): Promise<BatchResult> {
  return runBatch(
    buildBatchScript(todoIds, `set status of targetTodo to completed`)
  );
}

export async function batchCancel(todoIds: string[]): Promise<BatchResult> {
  return runBatch(
    buildBatchScript(todoIds, `set status of targetTodo to canceled`)
  );
}

export async function batchMoveToProject(
  todoIds: string[],
  projectName: string
): Promise<BatchResult> {
  const prelude = `${resolveContainer(projectName, ["project"])}
    if targetKind is "" then error "No project named \\"${escapeAS(
      projectName
    )}\\""`;
  return runBatch(
    buildBatchScript(todoIds, placeTodo("targetTodo"), prelude)
  );
}

export async function batchTag(
  todoIds: string[],
  tagNames: string[]
): Promise<BatchResult> {
  const tagStr = tagNames.map(escapeAS).join(",");
  return runBatch(
    buildBatchScript(todoIds, `set tag names of targetTodo to "${tagStr}"`)
  );
}

// ── Parsing ──

function parseIdNamePairs(raw: string): { id: string; name: string }[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, ...rest] = line.split("\t");
      return { id: id!, name: rest.join("\t") };
    });
}

function parseCommaSep(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
