# Plugin Architecture

All source code is in `src/`. Styles are in `styles.css`.
Built with esbuild; output is `main.js` (single CommonJS bundle).

---

## Entry point: `RootNotesPlugin`

`export default class RootNotesPlugin extends Plugin`

Owns all lifecycle, event registration, and cross-component state.

**Responsibilities:**
- Registers both view types (`note-chain`, `thread-view`) on load.
- Registers the ribbon icon and all five commands.
- Owns the in-memory title map (`titleMap: Map<string, string>`).
- Calls `rebuildTitleMap()` on the events that invalidate it.
- Calls `refreshRootNotesView()` to repaint the sidebar after a rebuild.
- Exposes `openThreadView(file: TFile)` so other components can open a thread tab.
- Detaches both view types on unload.

**Events that trigger index rebuild:**
- `metadataCache.on("resolved")` — fires after all pending file metadata is processed; covers creates, edits.
- `vault.on("delete")` and `vault.on("rename")` — structural changes not guaranteed to fire `resolved`.
- `workspace.onLayoutReady` — initial build at startup.

---

## Component: Sidebar (`RootNotesView`)

`class RootNotesView extends ItemView` — view type `note-chain`

Opened in the right leaf on startup and via the "Open Note Chain" command.

---

## Command: Refresh index (`src/index-builder.ts`)

Registered as `refresh-index`. Rebuilds managed index notes for all tags in the vault.

**Algorithm:**
1. Scans all markdown files via `metadataCache`; skips notes whose `chain` starts with `internal/index` to avoid self-indexing.
2. Builds `tag → TFile[]` map using `getAllTags` (covers frontmatter and inline tags).
3. For each tag, looks for an existing note with `chain: "internal/index/tag/<tag>"`:
   - 0 found → creates a new note via `vault.create` with a timestamp filename.
   - 1 found → overwrites content in place.
   - 2+ found → shows a `Notice` and throws (user must deduplicate first).
4. Writes tag index content: YAML frontmatter with the chain value, the managed epigraph, and a sorted `[[wikilink]]` list of tagged notes.
5. Applies the same find-or-create logic for a master index (`chain: "internal/index"`) that lists all `internal/index/` notes. Pre-existing orphaned index notes (tags since deleted) are included via the metadata cache; newly created ones are merged in directly since the cache hasn't updated yet.
6. Shows a `Notice` on success.

**Error handling:** duplicate chain values abort immediately via `assertUnique`; the error is caught in `main.ts` and logged.

---

## Command: Create successor

Registered as `create-successor`. Available when a file is active (`checkCallback`).

1. Captures `currentFile = workspace.getActiveFile()`.
2. Registers a one-shot `active-leaf-change` listener that inserts `[[currentFile.basename]]` into the new note's editor once it opens.
3. Executes the built-in `zk-prefixer:new-zk-note` command (Unique note creator core plugin) via `app.commands.executeCommandById`.
4. If the command is unavailable (plugin disabled), the listener is cleaned up immediately and an error is logged.

**Render cycle** (called by `refreshRootNotesView()` and `onOpen`):
1. Calls `computeGraph(app)` to get `rootNodes`, `cycleNodes`, `outLinks`, `inLinks`.
2. For each node path, calls `computeTitle(...)` → falls back to `file.basename`.
4. Renders an `<ul>` where each `<li>` contains:
   - A clickable `<a>` that opens the note in the current leaf.
   - A `↺` span for cycle nodes.
   - A thread-view button (list-lines SVG icon) that calls `plugin.openThreadView(file)`. The button is hidden via CSS and revealed on `li:hover`.

`render()` does **not** touch `plugin.titleMap` — that is the plugin's responsibility.

---

## Component: Thread View (`ThreadView`)

`class ThreadView extends ItemView` — view type `thread-view`

Opened as a new tab via `plugin.openThreadView(file)` or the "Show thread view" command (requires an active file). Multiple thread tabs can coexist.

**State:** `rootPath: string | null` — persisted via `getState()`/`setState()`, so the tab survives Obsidian restarts.

**Render cycle** (async, called from `setState` and `onOpen`):
1. Calls `buildLinkMaps(app)` to get `outLinks`.
2. BFS from `rootPath` over `outLinks` to collect the full subtree (set of paths).
3. Resolves each path to a `TFile`; sorts by `TFile.stat.ctime` descending (newest first).
4. For each file:
   - Creates a `div.thread-section` with an `h2.thread-note-title`.
   - The `h2` contains a clickable `<a>` that opens the note.
   - Reads file content with `vault.read(file)`.
   - Renders markdown with `MarkdownRenderer.render(app, content, el, sourcePath, this)`.

The view is read-only by design (no editor, no CodeMirror). Tab title is `Thread: <basename>`.

---

## Component: In-Memory Title Map

`plugin.titleMap: Map<string, string>` — maps display title → file path.

Populated exclusively by `plugin.rebuildTitleMap()`, which:
1. Calls `computeGraph(app)` to get all root and cycle node paths.
2. For each path, resolves to a `TFile` and calls `computeTitle(...)`.
3. Falls back to `file.basename` when `computeTitle` returns null.

Consumed by:
- `RootNotesSuggestModal` (fuzzy search for "Link chain" command).
- `render()` in `RootNotesView` does **not** use it; it calls `computeTitle` directly so the sidebar always shows fresh data.

Collision semantics: if two root notes resolve to the same display title, the second one silently overwrites the first in the map. This is a known limitation of the prototype.

---

## Component: Fuzzy-Search Modal (`RootNotesSuggestModal`)

`class RootNotesSuggestModal extends FuzzySuggestModal<TitleEntry>`

Opened by the "Link chain" command (editor callback — only active when an editor is focused).

Snapshots `plugin.titleMap` at construction time into a `TitleEntry[]` array. On item selection, inserts `[[basename]]` at the editor cursor via `editor.replaceSelection`.

---

## Graph Computation

Two pure functions operating on `App`:

### `buildLinkMaps(app): LinkMaps`

Iterates `app.vault.getMarkdownFiles()` and `app.metadataCache.resolvedLinks` to build:
- `outLinks: Map<path, Set<path>>` — forward edges (A links to B).
- `inLinks: Map<path, Set<path>>` — reverse edges (B is linked by A).

Only markdown files are included; non-markdown targets in `resolvedLinks` are skipped. Self-links are ignored.

Used by both `computeGraph` and `ThreadView`.

### `computeGraph(app): GraphData`

Runs **Kosaraju's SCC algorithm** (iterative, no recursion) on `outLinks`/`inLinks` to find source SCCs — SCCs with no incoming edges from other SCCs:
- Single-node SCC → **root note** (shown normally in sidebar).
- Multi-node SCC → **cycle node** (shown in red with ↺). One alphabetically-first representative is picked per cycle.

Returns `rootNodes[]`, `cycleNodes[]`, `outLinks`, `inLinks`.

---

## Title Computation

### `computeTitle(rootPath, outLinks, inLinks, app): string | null`

Computes the display title of the root of a maximum inclusion chain using the `chain` frontmatter property and tags from notes in the chain.

**Algorithm:**
1. BFS from `rootPath` over `outLinks` → `chain: Set<path>`.
2. A note is a **candidate** if it has a `chain` frontmatter property or any tag.
3. **Elimination rule:** candidate X is eliminated if any other candidate Y can reach X through the chain graph (directly or through intermediate notes).
4. Collect values (chain property values + tags) from surviving candidate notes:
   - 0 surviving candidates → return `null` (caller uses `file.basename`).
   - 1 surviving candidate → return its value.
   - 2+ surviving candidates → return `"chain collision: [A, B, ...]"`.

No external plugin dependency — uses Obsidian's native metadata cache directly.

---

## Error Handling

All unexpected errors are logged to the browser console with the `[note-chain]` prefix.
- `console.warn` — expected-but-notable cases (unexpected file type).
- `console.error` — unexpected failures (graph computation, file read, markdown render).
- `render()` in the sidebar shows an inline error message if `computeGraph` throws.
- `ThreadView.render()` shows a per-section error message if a file read or render fails, and continues with remaining notes.
