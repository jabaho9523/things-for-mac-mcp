# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
