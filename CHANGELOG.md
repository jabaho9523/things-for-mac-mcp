# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.1] — 2026-08-19

### Fixed
- **`npm install` failed to build on Node 24 and newer.** The pinned `better-sqlite3` ^11.8.2 has no prebuilt binary for those runtimes, and its source no longer compiles against current V8 headers — `no member named 'GetPrototype' in 'v8::Object'`, `no member named 'GetIsolate' in 'v8::Context'`, and `no member named 'This' in 'v8::PropertyCallbackInfo'`, all APIs V8 has since removed. Upstream added Node 26 support in 12.10.0; the dependency is now `^13.0.3`. The API this server uses (`new Database`, `pragma`, `prepare().all()/.get()`) is unchanged across the bump.

### Added
- `engines.node: >=22` in `package.json`, so npm warns about an unsupported runtime up front instead of failing partway through a native compile.

## [1.2.0] — 2026-08-19

### Fixed
- **`move_todo` with `target_project` always failed with `Cannot move to-do (301)`.** Things' `move` command takes a *list* — which is why moving to Anytime or Someday always worked while every move into a project failed. A to-do's `project` and `area` are ordinary mutable properties, so both moves are now property assignments (`set project of …`, `set area of …`) rather than `move`.
- **`add_todo` could not file an item into an existing project** (`AppleEvent handler failed. (-10000)`). The generated script used `make new to do with properties {…} of project "X"`, which isn't a valid `make` location specifier. Now uses `at end of`, with a create-then-assign fallback.
- **`add_todo` rejected Area names** (`Can't get project "…" (-1728)`) even though `list` is documented as accepting any destination. The destination was hardcoded to `project`; it is now resolved as a project, then an area, then a built-in list.
- **Batch tools reported live to-dos as "not found".** `repeat with targetId in idList` binds an AppleScript *reference* to the list item, not the string inside it, so the id comparison and the "not found" report both operated on a reference. Fixed with `contents of`.
- **`Can't get item N of every to do. Invalid index. (-1719)`.** Every write helper located its target by scanning the entire `to dos` collection. The scan was O(n) over the whole library per call, and AppleScript re-resolves `item N of to dos` on each iteration — so any concurrent mutation (Cloud sync, reindexing) invalidated the indices mid-scan. All lookups now use Things' `to do id "…"` object specifier.
- **Multi-line notes produced a syntax error.** `escapeAS` escaped quotes and backslashes but not control characters, so a newline in `notes` terminated the AppleScript string literal. Newlines, carriage returns, and tabs are now escaped.
- **`deadline` was locale-dependent.** `date "2026-09-01"` parses against the user's locale and throws on most non-US systems. Date components are now assigned individually, and a malformed deadline raises a clear error instead of an AppleScript failure.

### Added
- **`move_todo` accepts `target_area`** to file a to-do directly under an area with no project. `target_list` also now falls back to an area or project of the same name.
- **`cancel_items` runs as a single batch.** It previously spawned one `osascript` process per id and aborted the whole call on the first failure; it now reports per-id results like `complete_items`.

### Changed
- `add_todo`'s `list` parameter is documented as accepting a project, area, or built-in list name.
- Batch helpers return a uniform `{ succeeded, notFound }` shape instead of per-operation field names.

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
