# things-for-mac-mcp

A powerful MCP (Model Context Protocol) server for **Things 3** on macOS. Goes beyond basic read/write by leveraging AppleScript for operations the URL scheme can't do — move, delete, batch operations, area/tag management — plus analytics and workflow tools.

## What makes this different?

Most existing Things 3 MCP servers rely solely on the URL scheme for writes, which limits them to basic create/update operations. This server goes further:

| Capability | Typical URL-scheme-only MCPs | This MCP |
|---|---|---|
| **Write mechanism** | URL scheme only | AppleScript + URL scheme |
| **Move items** | Not supported | Move between projects/lists |
| **Delete/trash** | Not supported | Trash via AppleScript |
| **Batch operations** | Not supported | Batch complete, move, tag |
| **Area management** | Read only | Create areas |
| **Tag management** | Read only | Create tags |
| **Analytics** | Not supported | Stats, overdue, stale items, project progress |
| **Workflow tools** | Not supported | Weekly review, export (JSON/MD/CSV) |
| **MCP Resources** | Not used | List views as resources |
| **MCP Prompts** | Not used | Weekly review, daily planning, project breakdown |
| **SQLite access** | Via Python wrappers | Direct (no Python dependency) |

## Requirements

- **macOS** with Things 3 installed
- **Node.js** 18+
- Things 3 > Settings > General > **Enable Things URLs** must be checked

## Installation

```bash
# Clone and build
git clone https://github.com/jabaho9523/things-for-mac-mcp.git
cd things-for-mac-mcp
npm install
npm run build
```

### Connect to an MCP client

MCP is client-agnostic — the same server binary plugs into any MCP host. Two configurations are covered below.

#### Claude (Desktop / Code)

Add to your `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "things": {
      "command": "node",
      "args": ["/path/to/things-for-mac-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude after editing. The 30 tools, resources, and prompts are now available in any conversation.

#### Perplexity (Mac desktop app)

Perplexity's Mac app supports MCP servers. In Perplexity → Settings → **Connectors / MCP Servers**, add the same entry:

```json
{
  "mcpServers": {
    "things": {
      "command": "node",
      "args": ["/path/to/things-for-mac-mcp/dist/index.js"]
    }
  }
}
```

Restart Perplexity. macOS will prompt once for Automation permission so the server can control Things 3 — approve it. Note that this only works on the **Mac desktop app** (not web or iOS), since the server talks to the local Things 3 install via AppleScript.

## Troubleshooting

**"Things 3 database not found"**

Things 3 must have been launched at least once so that macOS creates the SQLite file. The MCP auto-detects both database layouts:

- **Cloud-synced** (default when Things Cloud is enabled):
  `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-XXXXX/Things Database.thingsdatabase/main.sqlite`
- **Legacy** (no Cloud sync):
  `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/Things Database.thingsdatabase/main.sqlite`

If neither is found, the error message lists the path that was checked.

**Changes to the source code don't take effect**

The MCP runs `dist/index.js`, not the TypeScript source. After editing anything in `src/`:

```bash
npm run build
```

Then **restart your MCP client** (Claude Desktop / Claude Code / Perplexity) so the server reloads the new compiled code.

**Node version**

Requires Node.js 18 or newer.

## Tools (30 total)

### Read Tools (15)
| Tool | Description |
|------|-------------|
| `get_inbox` | Get all todos in the Inbox |
| `get_today` | Get todos scheduled for Today |
| `get_upcoming` | Get upcoming scheduled todos |
| `get_anytime` | Get Anytime todos (excludes Someday projects) |
| `get_someday` | Get Someday todos |
| `get_logbook` | Get completed todos (configurable days back) |
| `get_trash` | Get trashed items |
| `get_todos` | Get open todos, optionally by project |
| `get_projects` | Get all projects |
| `get_areas` | Get all areas |
| `get_tags` | Get all tags |
| `get_headings` | Get project headings |
| `search_todos` | Search by title or notes |
| `search_advanced` | Multi-filter search (status, tag, area, project, date) |
| `get_recent` | Recently created items |

### Write Tools (12)
| Tool | Description | Mechanism |
|------|-------------|-----------|
| `add_todo` | Create todo with scheduling, tags, checklists | URL scheme |
| `add_project` | Create project with todos and headings | URL scheme (JSON) |
| `update_todo` | Update todo properties | URL scheme |
| `complete_items` | Complete one or more todos | **AppleScript** |
| `cancel_items` | Cancel one or more todos | **AppleScript** |
| `delete_items` | Trash one or more todos | **AppleScript** |
| `move_todo` | Move todo to different project/list | **AppleScript** |
| `batch_move` | Move multiple todos to a project | **AppleScript** |
| `batch_tag` | Apply tags to multiple todos | **AppleScript** |
| `create_area` | Create a new area | **AppleScript** |
| `create_tag` | Create a new tag | **AppleScript** |
| `show_item` / `search_in_things` | Navigate Things UI | URL scheme |

### Analytics Tools (4)
| Tool | Description |
|------|-------------|
| `get_statistics` | Completion rates, inbox size, overdue count, avg completion time |
| `get_overdue` | Todos past their deadline |
| `get_stale_items` | Todos not updated in N days |
| `get_project_progress` | Completion % for all active projects |

### Workflow Tools (2)
| Tool | Description |
|------|-------------|
| `weekly_review` | Full weekly review: completed, overdue, stale, inbox, project progress |
| `export_list` | Export any list to JSON, Markdown, or CSV |

## MCP Resources

The server exposes Things lists as MCP resources:
- `things://inbox`, `things://today`, `things://upcoming`, `things://anytime`, `things://someday`
- `things://projects`, `things://areas`, `things://tags`
- `things://project/{projectId}` — todos within a specific project

## MCP Prompts

Built-in prompt templates for common workflows:
- **weekly_review** — Guided weekly review of all tasks
- **daily_planning** — Plan your day with prioritized suggestions
- **project_breakdown** — Break down a goal into a structured Things project

## Architecture

```
src/
├── index.ts                  # Entry point (stdio transport)
├── adapters/
│   ├── applescript.ts        # AppleScript execution (write operations)
│   ├── database.ts           # SQLite queries (read operations)
│   └── urlscheme.ts          # Things URL scheme (create/update/navigate)
├── tools/
│   ├── read.ts               # 15 read tools
│   ├── write.ts              # 12 write tools
│   ├── analytics.ts          # 4 analytics tools
│   └── workflow.ts           # 2 workflow tools
├── resources/
│   └── lists.ts              # MCP resources
├── prompts/
│   └── workflows.ts          # MCP prompt templates
└── utils/
    └── formatting.ts         # Output formatting
```

## More from the author

- **[HyperCap](https://www.nexiuslab.com/)** — Turns Caps Lock into a hyperkey on macOS. 27 shortcuts, snippets, markdown-to-rich-text, and a research notebook on one key.
- **[obsidian-paste-plus](https://github.com/jabaho9523/obsidian-paste-plus)** — Smart paste for Obsidian: URLs, images, HTML, YouTube, and Twitter in one plugin.
- **[obsidian-link-plus](https://github.com/jabaho9523/obsidian-link-plus)** — Find every unlinked mention in your vault and convert them to wikilinks — one click or batch.
- **[obsidian-vault-plus](https://github.com/jabaho9523/obsidian-vault-plus)** — Vault health dashboard: orphans, broken links, empty notes, duplicates, unused tags, unreferenced attachments — with one-click fixes.

## License

MIT
