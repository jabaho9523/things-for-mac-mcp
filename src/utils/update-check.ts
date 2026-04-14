import { homedir } from "node:os";
import { join, dirname } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";

const REPO = "jabaho9523/things-for-mac-mcp";
const CACHE_DIR = join(homedir(), ".config", "things-mcp");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5000;

interface CacheEntry {
  checkedAt: number;
  latestVersion: string;
}

/**
 * Compare two dotted-numeric version strings (optional leading "v").
 * Returns positive if a > b, negative if a < b, 0 if equal.
 * Non-numeric or missing segments are treated as 0 — good enough for
 * our own semver-ish tags (e.g. "v1.2.0" vs "1.1.3").
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Partial<CacheEntry>;
    if (
      typeof data.checkedAt !== "number" ||
      typeof data.latestVersion !== "string"
    ) {
      return null;
    }
    if (Date.now() - data.checkedAt > CACHE_TTL_MS) return null;
    return { checkedAt: data.checkedAt, latestVersion: data.latestVersion };
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(entry));
  } catch {
    // ignore — cache is an optimization, not a correctness requirement
  }
}

async function fetchLatestTag(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: {
          "User-Agent": "things-for-mac-mcp",
          Accept: "application/vnd.github+json",
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check GitHub for a newer release and log a stderr notice if one exists.
 * - Never throws.
 * - Never writes to stdout (stdout is reserved for the MCP stdio transport).
 * - Cached for 24h so client restarts don't hammer the GitHub API.
 * - Silent when offline, rate-limited, or no release has been cut yet.
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    const cached = readCache();
    let latest = cached?.latestVersion;
    if (!latest) {
      const fetched = await fetchLatestTag();
      if (!fetched) return;
      latest = fetched;
      writeCache({ checkedAt: Date.now(), latestVersion: latest });
    }
    if (compareVersions(latest, currentVersion) > 0) {
      console.error(
        `[things-mcp] Update available: ${latest} (you're on v${currentVersion}). ` +
          `Run: cd things-for-mac-mcp && git pull && npm install && npm run build`
      );
    }
  } catch {
    // Defensive — any unexpected error is swallowed so the server never crashes
    // because of a version check.
  }
}
