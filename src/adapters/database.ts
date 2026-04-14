import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const GROUP_CONTAINER = join(
  homedir(),
  "Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac"
);
const DB_SUFFIX = "Things Database.thingsdatabase/main.sqlite";

function resolveThingsDbPath(): string {
  // Cloud-synced layout: ThingsData-XXXXX/Things Database.thingsdatabase/main.sqlite
  try {
    const cloudDir = readdirSync(GROUP_CONTAINER).find((n) =>
      n.startsWith("ThingsData-")
    );
    if (cloudDir) {
      const cloudPath = join(GROUP_CONTAINER, cloudDir, DB_SUFFIX);
      if (existsSync(cloudPath)) return cloudPath;
    }
  } catch {
    // Group container doesn't exist yet — fall through to legacy path for the error message
  }

  // Legacy / local-only layout
  return join(GROUP_CONTAINER, DB_SUFFIX);
}

const THINGS_DB_PATH = resolveThingsDbPath();

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!existsSync(THINGS_DB_PATH)) {
    throw new Error(
      `Things 3 database not found. Checked:\n` +
        `  - ${THINGS_DB_PATH}\n` +
        `Make sure Things 3 is installed and has been launched at least once. ` +
        `If you use Things Cloud, the DB lives under a ThingsData-XXXXX subfolder of ` +
        `${GROUP_CONTAINER}.`
    );
  }
  _db = new Database(THINGS_DB_PATH, { readonly: true });
  _db.pragma("journal_mode = WAL");
  return _db;
}

// ── Status constants (from Things SQLite schema) ──

export const STATUS = {
  OPEN: 0,
  COMPLETED: 3,
  CANCELED: 2,
} as const;

export const TASK_TYPE = {
  TODO: 0,
  PROJECT: 1,
  HEADING: 2,
} as const;

export const TRASHED = {
  NOT_TRASHED: 0,
  TRASHED: 1,
} as const;

// Things 3 `start` column semantics (per things.py reference implementation):
//   0 = Inbox
//   1 = Anytime bucket — includes both unscheduled (Anytime list) and
//       scheduled-for-today (Today list). The distinction is whether
//       startDate is set.
//   2 = Someday bucket — includes both undated (Someday list) and
//       future-dated (Upcoming list). The distinction is whether
//       startDate is set.
export const START = {
  INBOX: 0,
  ANYTIME: 1,
  SOMEDAY: 2,
} as const;

// ── Core query helpers ──

export interface TodoRow {
  uuid: string;
  title: string;
  notes: string | null;
  status: number;
  type: number;
  start: number;
  startBucket: number | null;
  startDate: string | null;
  deadline: string | null;
  stopDate: string | null;
  creationDate: number | null;
  userModificationDate: number | null;
  project: string | null;
  projectTitle: string | null;
  area: string | null;
  areaTitle: string | null;
  tags: string | null;
  checklistCount: number;
  checklistCompletedCount: number;
  trashed: number;
  todayIndex: number | null;
}

const BASE_TODO_SELECT = `
  SELECT
    t.uuid,
    t.title,
    t.notes,
    t.status,
    t.type,
    t.start,
    t.startBucket,
    date(t.startDate, 'unixepoch') AS startDate,
    date(t.deadline, 'unixepoch') AS deadline,
    date(t.stopDate, 'unixepoch') AS stopDate,
    t.creationDate,
    t.userModificationDate,
    t.project AS project,
    p.title AS projectTitle,
    t.area AS area,
    a.title AS areaTitle,
    GROUP_CONCAT(tag.title) AS tags,
    (SELECT COUNT(*) FROM TMChecklistItem ci WHERE ci.task = t.uuid) AS checklistCount,
    (SELECT COUNT(*) FROM TMChecklistItem ci WHERE ci.task = t.uuid AND ci.status = 3) AS checklistCompletedCount,
    t.trashed,
    t.todayIndex
  FROM TMTask t
  LEFT JOIN TMTask p ON t.project = p.uuid
  LEFT JOIN TMArea a ON COALESCE(t.area, p.area) = a.uuid
  LEFT JOIN TMTaskTag tt ON t.uuid = tt.tasks
  LEFT JOIN TMTag tag ON tt.tags = tag.uuid
`;

const BASE_GROUP_BY = `GROUP BY t.uuid`;

// ── List queries ──

export function getInbox(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.start = ${START.INBOX}
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
     ${BASE_GROUP_BY}
     ORDER BY t.todayIndex`
    )
    .all() as TodoRow[];
}

// Today = Anytime-bucket tasks that have been scheduled (startDate set).
// Excludes tasks whose parent project is in Someday.
export function getToday(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.start = ${START.ANYTIME}
       AND t.startDate IS NOT NULL
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND (t.project IS NULL OR p.start != ${START.SOMEDAY})
     ${BASE_GROUP_BY}
     ORDER BY t.todayIndex`
    )
    .all() as TodoRow[];
}

// Upcoming = future-scheduled tasks (still in Someday bucket until their
// start date arrives, at which point Things moves them to Anytime).
export function getUpcoming(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.start = ${START.SOMEDAY}
       AND t.startDate IS NOT NULL
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
     ${BASE_GROUP_BY}
     ORDER BY t.startDate`
    )
    .all() as TodoRow[];
}

// Anytime = Anytime-bucket tasks with no startDate (unscheduled).
// Excludes Today items (which have a startDate) and Someday-project children.
export function getAnytime(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.start = ${START.ANYTIME}
       AND t.startDate IS NULL
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND (t.project IS NULL OR p.start != ${START.SOMEDAY})
     ${BASE_GROUP_BY}
     ORDER BY t.todayIndex`
    )
    .all() as TodoRow[];
}

// Someday = Someday-bucket tasks with no startDate, plus any tasks whose
// parent project is in Someday.
export function getSomeday(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND (
         (t.start = ${START.SOMEDAY} AND t.startDate IS NULL)
         OR (t.project IS NOT NULL AND p.start = ${START.SOMEDAY})
       )
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
     ${BASE_GROUP_BY}`
    )
    .all() as TodoRow[];
}

export function getLogbook(daysBack: number = 7): TodoRow[] {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - daysBack * 86400;
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.status IN (${STATUS.COMPLETED}, ${STATUS.CANCELED})
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND t.stopDate >= ${cutoff}
     ${BASE_GROUP_BY}
     ORDER BY t.stopDate DESC`
    )
    .all() as TodoRow[];
}

export function getTrash(): TodoRow[] {
  const db = getDb();
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.trashed = ${TRASHED.TRASHED}
     ${BASE_GROUP_BY}`
    )
    .all() as TodoRow[];
}

// ── Entity queries ──

export function getTodos(projectId?: string): TodoRow[] {
  const db = getDb();
  let whereExtra = "";
  if (projectId) whereExtra = `AND t.project = '${projectId}'`;
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       ${whereExtra}
     ${BASE_GROUP_BY}
     ORDER BY t.todayIndex`
    )
    .all() as TodoRow[];
}

export interface ProjectRow extends TodoRow {
  todoCount: number;
  completedTodoCount: number;
}

export function getProjects(includeCompleted: boolean = false): ProjectRow[] {
  const db = getDb();
  const statusFilter = includeCompleted
    ? ""
    : `AND t.status = ${STATUS.OPEN}`;
  return db
    .prepare(
      `${BASE_TODO_SELECT},
     (SELECT COUNT(*) FROM TMTask sub WHERE sub.project = t.uuid AND sub.type = ${TASK_TYPE.TODO} AND sub.trashed = ${TRASHED.NOT_TRASHED}) AS todoCount,
     (SELECT COUNT(*) FROM TMTask sub WHERE sub.project = t.uuid AND sub.type = ${TASK_TYPE.TODO} AND sub.status = ${STATUS.COMPLETED} AND sub.trashed = ${TRASHED.NOT_TRASHED}) AS completedTodoCount
     WHERE t.type = ${TASK_TYPE.PROJECT}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       ${statusFilter}
     ${BASE_GROUP_BY}`
    )
    .all() as ProjectRow[];
}

export interface AreaRow {
  uuid: string;
  title: string;
  visible: number;
}

export function getAreas(): AreaRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT uuid, title, visible FROM TMArea ORDER BY "index"`)
    .all() as AreaRow[];
}

export interface TagRow {
  uuid: string;
  title: string;
}

export function getTags(): TagRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT uuid, title FROM TMTag ORDER BY title`)
    .all() as TagRow[];
}

export interface HeadingRow {
  uuid: string;
  title: string;
  projectUuid: string;
  projectTitle: string;
}

export function getHeadings(projectId?: string): HeadingRow[] {
  const db = getDb();
  let whereExtra = "";
  if (projectId) whereExtra = `AND t.project = '${projectId}'`;
  return db
    .prepare(
      `SELECT t.uuid, t.title, t.project AS projectUuid, p.title AS projectTitle
     FROM TMTask t
     LEFT JOIN TMTask p ON t.project = p.uuid
     WHERE t.type = ${TASK_TYPE.HEADING}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       ${whereExtra}
     ORDER BY t."index"`
    )
    .all() as HeadingRow[];
}

// ── Search ──

export function searchTodos(query: string): TodoRow[] {
  const db = getDb();
  const pattern = `%${query}%`;
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND (t.title LIKE ? OR t.notes LIKE ?)
     ${BASE_GROUP_BY}
     ORDER BY t.userModificationDate DESC
     LIMIT 50`
    )
    .all(pattern, pattern) as TodoRow[];
}

export function searchAdvanced(filters: {
  query?: string;
  status?: "open" | "completed" | "canceled";
  startDate?: string;
  deadline?: string;
  tag?: string;
  area?: string;
  project?: string;
  type?: "todo" | "project";
  createdWithinDays?: number;
}): TodoRow[] {
  const db = getDb();
  const conditions: string[] = [
    `t.trashed = ${TRASHED.NOT_TRASHED}`,
  ];
  const params: unknown[] = [];

  if (filters.query) {
    conditions.push(`(t.title LIKE ? OR t.notes LIKE ?)`);
    params.push(`%${filters.query}%`, `%${filters.query}%`);
  }
  if (filters.status === "open") conditions.push(`t.status = ${STATUS.OPEN}`);
  if (filters.status === "completed")
    conditions.push(`t.status = ${STATUS.COMPLETED}`);
  if (filters.status === "canceled")
    conditions.push(`t.status = ${STATUS.CANCELED}`);
  if (filters.type === "todo")
    conditions.push(`t.type = ${TASK_TYPE.TODO}`);
  if (filters.type === "project")
    conditions.push(`t.type = ${TASK_TYPE.PROJECT}`);
  if (filters.tag) {
    conditions.push(`tag.title = ?`);
    params.push(filters.tag);
  }
  if (filters.area) {
    conditions.push(`a.title = ?`);
    params.push(filters.area);
  }
  if (filters.project) {
    conditions.push(`p.title = ?`);
    params.push(filters.project);
  }
  if (filters.createdWithinDays) {
    const cutoff =
      Math.floor(Date.now() / 1000) - filters.createdWithinDays * 86400;
    conditions.push(`t.creationDate >= ${cutoff}`);
  }

  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE ${conditions.join(" AND ")}
     ${BASE_GROUP_BY}
     ORDER BY t.userModificationDate DESC
     LIMIT 100`
    )
    .all(...params) as TodoRow[];
}

export function getRecent(daysBack: number = 3): TodoRow[] {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - daysBack * 86400;
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND t.creationDate >= ${cutoff}
     ${BASE_GROUP_BY}
     ORDER BY t.creationDate DESC`
    )
    .all() as TodoRow[];
}

// ── Analytics queries ──

export interface StatsResult {
  totalOpen: number;
  totalCompleted: number;
  totalCanceled: number;
  completedToday: number;
  completedThisWeek: number;
  inboxCount: number;
  overdueCount: number;
  avgCompletionDays: number | null;
  projectCount: number;
  areaCount: number;
  tagCount: number;
}

export function getStatistics(): StatsResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % 86400);
  const weekStart = todayStart - 6 * 86400;

  const totalOpen = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.OPEN} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const totalCompleted = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.COMPLETED} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const totalCanceled = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.CANCELED} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const completedToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.COMPLETED} AND stopDate >= ${todayStart} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const completedThisWeek = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.COMPLETED} AND stopDate >= ${weekStart} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const inboxCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND start = ${START.INBOX} AND status = ${STATUS.OPEN} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const overdueCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.OPEN} AND deadline < ${todayStart} AND deadline IS NOT NULL AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const avgRow = db
    .prepare(
      `SELECT AVG((stopDate - creationDate) / 86400.0) as avg FROM TMTask WHERE type = ${TASK_TYPE.TODO} AND status = ${STATUS.COMPLETED} AND stopDate IS NOT NULL AND creationDate IS NOT NULL AND trashed = ${TRASHED.NOT_TRASHED}`
    )
    .get() as { avg: number | null };

  const projectCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM TMTask WHERE type = ${TASK_TYPE.PROJECT} AND status = ${STATUS.OPEN} AND trashed = ${TRASHED.NOT_TRASHED}`
      )
      .get() as { c: number }
  ).c;

  const areaCount = (
    db.prepare(`SELECT COUNT(*) as c FROM TMArea`).get() as { c: number }
  ).c;

  const tagCount = (
    db.prepare(`SELECT COUNT(*) as c FROM TMTag`).get() as { c: number }
  ).c;

  return {
    totalOpen,
    totalCompleted,
    totalCanceled,
    completedToday,
    completedThisWeek,
    inboxCount,
    overdueCount,
    avgCompletionDays: avgRow.avg ? Math.round(avgRow.avg * 10) / 10 : null,
    projectCount,
    areaCount,
    tagCount,
  };
}

export function getOverdue(): TodoRow[] {
  const db = getDb();
  const todayStart = Math.floor(Date.now() / 1000);
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.status = ${STATUS.OPEN}
       AND t.deadline IS NOT NULL
       AND t.deadline < ${todayStart}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
     ${BASE_GROUP_BY}
     ORDER BY t.deadline ASC`
    )
    .all() as TodoRow[];
}

export function getStaleItems(daysStale: number = 14): TodoRow[] {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - daysStale * 86400;
  return db
    .prepare(
      `${BASE_TODO_SELECT}
     WHERE t.type = ${TASK_TYPE.TODO}
       AND t.status = ${STATUS.OPEN}
       AND t.trashed = ${TRASHED.NOT_TRASHED}
       AND t.userModificationDate < ${cutoff}
     ${BASE_GROUP_BY}
     ORDER BY t.userModificationDate ASC
     LIMIT 50`
    )
    .all() as TodoRow[];
}

export interface ProjectProgress {
  uuid: string;
  title: string;
  totalTodos: number;
  completedTodos: number;
  percentComplete: number;
  areaTitle: string | null;
}

export function getProjectProgress(): ProjectProgress[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
      p.uuid,
      p.title,
      COUNT(t.uuid) AS totalTodos,
      SUM(CASE WHEN t.status = ${STATUS.COMPLETED} THEN 1 ELSE 0 END) AS completedTodos,
      ROUND(100.0 * SUM(CASE WHEN t.status = ${STATUS.COMPLETED} THEN 1 ELSE 0 END) / MAX(COUNT(t.uuid), 1), 1) AS percentComplete,
      a.title AS areaTitle
    FROM TMTask p
    LEFT JOIN TMTask t ON t.project = p.uuid AND t.type = ${TASK_TYPE.TODO} AND t.trashed = ${TRASHED.NOT_TRASHED}
    LEFT JOIN TMArea a ON p.area = a.uuid
    WHERE p.type = ${TASK_TYPE.PROJECT}
      AND p.status = ${STATUS.OPEN}
      AND p.trashed = ${TRASHED.NOT_TRASHED}
    GROUP BY p.uuid
    ORDER BY percentComplete DESC`
    )
    .all() as ProjectProgress[];
}

// ── Weekly review data ──

export interface WeeklyReviewData {
  completedThisWeek: TodoRow[];
  overdue: TodoRow[];
  staleItems: TodoRow[];
  inboxCount: number;
  projectProgress: ProjectProgress[];
  stats: StatsResult;
}

export function getWeeklyReviewData(): WeeklyReviewData {
  return {
    completedThisWeek: getLogbook(7),
    overdue: getOverdue(),
    staleItems: getStaleItems(14),
    inboxCount: getInbox().length,
    projectProgress: getProjectProgress(),
    stats: getStatistics(),
  };
}
