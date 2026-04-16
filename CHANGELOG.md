# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.3] — 2026-04-16

### Fixed
- **`update_todo` now reads `THINGS_AUTH_TOKEN`.** Things' URL scheme requires an auth token for `update` calls, but the server had scaffolding and never plumbed it through — so `update_todo` failed even when the user pasted the token somewhere. Now reads `process.env.THINGS_AUTH_TOKEN` and throws a clear error pointing to the README if it's missing.

### Added
- README "Things authorization token" subsection explaining where to get the token (Things → Settings → General → Enable Things URLs → Manage) and how to pass it via the MCP client's `env` block. Both Claude and Perplexity config examples updated.
- Troubleshooting entry for the `update_todo requires an auth token` error.

## [1.1.2] — 2026-04-16

### Fixed
- **`add_project` now works.** Two bugs prevented it from ever succeeding: (1) the Things URL scheme command was `add-json` — which Things doesn't support; the correct endpoint is `json`. (2) The JSON payload was a flat object; Things requires `{"type":"project","attributes":{…}}` wrapping for both the project and its items. Also fixed the `area` parameter being silently dropped.
- **URL scheme used 4 slashes** (`things:////command`) instead of the correct 3 (`things:///command`). Things was lenient enough to accept it for most commands, but it was technically wrong.

### Changed
- **Tool count corrected** — the README header and section heading said 30 / 12 write tools; actual counts are **34 tools total / 13 write tools** (`show_item` and `search_in_things` were counted as one but are two separate tools).
- **Perplexity setup example** now uses an absolute `node` path (`/opt/homebrew/bin/node`) instead of the bare `"node"` string. Prevents the `NODE_MODULE_VERSION` mismatch that every Perplexity user hit on first launch, because Perplexity's Mac app doesn't inherit shell `PATH` and bundles its own older Node runtime.
- **Troubleshooting re-ordered:** the absolute-`node`-path fix is now the primary recommendation for `NODE_MODULE_VERSION` errors; the native-module rebuild is listed as the fallback for genuine install-vs-runtime Node mismatches.

## [1.1.1] — 2026-04-14

### Added
- Troubleshooting entry for `NODE_MODULE_VERSION` / `better-sqlite3` ABI mismatch with a copy-paste rebuild recipe.
- Troubleshooting entry for GUI-app `PATH` issues ("works in Claude Desktop but not Perplexity" etc.) — recommends using an absolute `node` path in the MCP config.
- Troubleshooting note about the harmless `prebuild-install` deprecation warning.

## [1.1.0] — 2026-04-14

### Added
- Perplexity (Mac desktop app) configuration instructions in the README
- Buy Me a Coffee support link
- Standalone `LICENSE` file (MIT was previously only declared in the README)
- `CHANGELOG.md`
- Startup update-check: the server checks for newer GitHub Releases on boot and logs a stderr notice if one is available. Cached for 24h at `~/.config/things-mcp/update-check.json`, fails silently when offline.
- "Staying up to date" README section explaining how to subscribe and upgrade
- Optional `limit` parameter on `get_anytime`, `get_logbook`, and `get_trash` (default 100)
- "More from the author" README section
- Client-support note on MCP Resources

### Fixed
- **Cloud-sync database path auto-detection.** Things Cloud creates a per-user `ThingsData-XXXXX` subfolder under the Group Container; the hardcoded path missed it and failed for every cloud-sync user. Now resolved at runtime.
- **`get_today` / `get_upcoming` / `get_anytime` / `get_someday` queries.** Previous version relied on an invented `startBucket` column; rewritten against Things 3's real schema (`start` + `startDate`) to match `things.py` reference behavior.
- **`add_todo` now returns the created todo's ID** when using the AppleScript creation path (no `when` / `heading` / `checklist_items`). Chained tool calls can now reference the new item directly.
- **`get_anytime` timeout on large libraries.** Added a default `LIMIT 100` (configurable via the tool's optional `limit` parameter). Same treatment applied to `get_logbook` and `get_trash`.
- **`delete_items` on completed/canceled todos.** AppleScript's default `to dos` collection excludes items in the Logbook, so trashing a completed item failed with "Todo not found". `delete_items` now falls back to searching the Logbook before giving up.

### Changed
- Renamed "Claude Desktop Configuration" to a generic "Connect to an MCP client" section covering both Claude (Desktop / Code) and Perplexity.

## [1.0.0] — 2026-03-26

### Added
- Initial release.
- 15 read tools: `get_inbox`, `get_today`, `get_upcoming`, `get_anytime`, `get_someday`, `get_logbook`, `get_trash`, `get_todos`, `get_projects`, `get_areas`, `get_tags`, `get_headings`, `search_todos`, `search_advanced`, `get_recent`.
- 12 write tools: `add_todo`, `add_project`, `update_todo`, `complete_items`, `cancel_items`, `delete_items`, `move_todo`, `batch_move`, `batch_tag`, `create_area`, `create_tag`, `show_item` / `search_in_things`.
- 4 analytics tools: `get_statistics`, `get_overdue`, `get_stale_items`, `get_project_progress`.
- 2 workflow tools: `weekly_review`, `export_list`.
- AppleScript adapter for writes (move, delete, batch ops, area/tag creation).
- Direct SQLite read adapter (no Python dependency).
- URL scheme adapter for rich creation (checklists, headings, auto-parse magic words).
- MCP Resources: `things://inbox`, `today`, `upcoming`, `anytime`, `someday`, `projects`, `areas`, `tags`, and `project/{projectId}`.
- MCP Prompts: `weekly_review`, `daily_planning`, `project_breakdown`.
