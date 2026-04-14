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

// ── Read helpers ──

export async function getListItems(
  listName: string
): Promise<{ id: string; name: string }[]> {
  const script = thingsScript(`
    set output to ""
    repeat with t in to dos of list "${listName}"
      set output to output & (id of t) & "\\t" & (name of t) & "\\n"
    end repeat
    return output
  `);
  return parseIdNamePairs(await runAppleScript(script));
}

// ── Write helpers ──

export async function createTodo(props: {
  name: string;
  notes?: string;
  listId?: string;
  projectName?: string;
  tagNames?: string[];
  dueDate?: string;
}): Promise<string> {
  const propParts: string[] = [`name:"${escapeAS(props.name)}"`];
  if (props.notes) propParts.push(`notes:"${escapeAS(props.notes)}"`);

  let target = "";
  if (props.projectName) {
    target = ` of project "${escapeAS(props.projectName)}"`;
  } else if (props.listId) {
    target = ` of list "${escapeAS(props.listId)}"`;
  }

  const tagAssign =
    props.tagNames && props.tagNames.length > 0
      ? `\nset tag names of newTodo to "${props.tagNames.map(escapeAS).join(",")}"`
      : "";

  const dueDateAssign = props.dueDate
    ? `\nset due date of newTodo to date "${escapeAS(props.dueDate)}"`
    : "";

  const script = thingsScript(`
    set newTodo to make new to do with properties {${propParts.join(", ")}}${target}${tagAssign}${dueDateAssign}
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

  let target = "";
  if (props.areaName) {
    target = ` of area "${escapeAS(props.areaName)}"`;
  }

  const tagAssign =
    props.tagNames && props.tagNames.length > 0
      ? `\nset tag names of newProj to "${props.tagNames.map(escapeAS).join(",")}"`
      : "";

  const script = thingsScript(`
    set newProj to make new project with properties {${propParts.join(", ")}}${target}${tagAssign}
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
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set status of t to completed
        return "ok"
      end if
    end repeat
    return "not found"
  `);
  const result = await runAppleScript(script);
  if (result === "not found") throw new Error(`Todo not found: ${todoId}`);
}

export async function cancelTodoById(todoId: string): Promise<void> {
  const script = thingsScript(`
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set status of t to canceled
        return "ok"
      end if
    end repeat
    return "not found"
  `);
  const result = await runAppleScript(script);
  if (result === "not found") throw new Error(`Todo not found: ${todoId}`);
}

export async function deleteTodoById(todoId: string): Promise<void> {
  // Things' `to dos` collection excludes items in the Logbook and Trash.
  // To let users delete completed / canceled items, we also search the
  // Logbook explicitly. (Items already in Trash aren't our concern.)
  const script = thingsScript(`
    set targetTodo to missing value
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set targetTodo to t
        exit repeat
      end if
    end repeat
    if targetTodo is missing value then
      repeat with t in to dos of list "Logbook"
        if id of t is "${escapeAS(todoId)}" then
          set targetTodo to t
          exit repeat
        end if
      end repeat
    end if
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
    set targetTodo to missing value
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set targetTodo to t
        exit repeat
      end if
    end repeat
    if targetTodo is missing value then error "Todo not found"
    move targetTodo to project "${escapeAS(projectName)}"
  `);
  await runAppleScript(script);
}

export async function moveTodoToList(
  todoId: string,
  listName: string
): Promise<void> {
  const script = thingsScript(`
    set targetTodo to missing value
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set targetTodo to t
        exit repeat
      end if
    end repeat
    if targetTodo is missing value then error "Todo not found"
    move targetTodo to list "${escapeAS(listName)}"
  `);
  await runAppleScript(script);
}

export async function setTagsOnTodo(
  todoId: string,
  tagNames: string[]
): Promise<void> {
  const script = thingsScript(`
    repeat with t in to dos
      if id of t is "${escapeAS(todoId)}" then
        set tag names of t to "${tagNames.map(escapeAS).join(",")}"
        return "ok"
      end if
    end repeat
    return "not found"
  `);
  const result = await runAppleScript(script);
  if (result === "not found") throw new Error(`Todo not found: ${todoId}`);
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

export async function batchComplete(todoIds: string[]): Promise<{
  completed: string[];
  notFound: string[];
}> {
  const idList = todoIds.map((id) => `"${escapeAS(id)}"`).join(", ");
  const script = thingsScript(`
    set idList to {${idList}}
    set completedIds to ""
    set notFoundIds to ""
    repeat with targetId in idList
      set found to false
      repeat with t in to dos
        if id of t is targetId then
          set status of t to completed
          set completedIds to completedIds & targetId & ","
          set found to true
          exit repeat
        end if
      end repeat
      if not found then set notFoundIds to notFoundIds & targetId & ","
    end repeat
    return completedIds & "|" & notFoundIds
  `);
  const result = await runAppleScript(script);
  const [completedStr, notFoundStr] = result.split("|");
  return {
    completed: parseCommaSep(completedStr),
    notFound: parseCommaSep(notFoundStr),
  };
}

export async function batchMoveToProject(
  todoIds: string[],
  projectName: string
): Promise<{ moved: string[]; notFound: string[] }> {
  const idList = todoIds.map((id) => `"${escapeAS(id)}"`).join(", ");
  const script = thingsScript(`
    set idList to {${idList}}
    set movedIds to ""
    set notFoundIds to ""
    set targetProj to project "${escapeAS(projectName)}"
    repeat with targetId in idList
      set found to false
      repeat with t in to dos
        if id of t is targetId then
          move t to targetProj
          set movedIds to movedIds & targetId & ","
          set found to true
          exit repeat
        end if
      end repeat
      if not found then set notFoundIds to notFoundIds & targetId & ","
    end repeat
    return movedIds & "|" & notFoundIds
  `);
  const result = await runAppleScript(script);
  const [movedStr, notFoundStr] = result.split("|");
  return {
    moved: parseCommaSep(movedStr),
    notFound: parseCommaSep(notFoundStr),
  };
}

export async function batchTag(
  todoIds: string[],
  tagNames: string[]
): Promise<{ tagged: string[]; notFound: string[] }> {
  const idList = todoIds.map((id) => `"${escapeAS(id)}"`).join(", ");
  const tagStr = tagNames.map(escapeAS).join(",");
  const script = thingsScript(`
    set idList to {${idList}}
    set taggedIds to ""
    set notFoundIds to ""
    repeat with targetId in idList
      set found to false
      repeat with t in to dos
        if id of t is targetId then
          set tag names of t to "${tagStr}"
          set taggedIds to taggedIds & targetId & ","
          set found to true
          exit repeat
        end if
      end repeat
      if not found then set notFoundIds to notFoundIds & targetId & ","
    end repeat
    return taggedIds & "|" & notFoundIds
  `);
  const result = await runAppleScript(script);
  const [taggedStr, notFoundStr] = result.split("|");
  return {
    tagged: parseCommaSep(taggedStr),
    notFound: parseCommaSep(notFoundStr),
  };
}

// ── Utilities ──

function escapeAS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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
