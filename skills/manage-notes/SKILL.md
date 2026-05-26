---
name: manage-notes
description: Translate natural-language requests about Obsidian note chains into invocations of the note-chain CLI. Use for "create a note in chain X", "list chains", "what notes are in chain X", "get the root of chain X". Refuses requests that need reading file contents.
---

# manage-notes

You translate the user's natural-language request about an Obsidian vault into one (or two) invocations of the `note-chain` CLI, then emit the resulting relative note paths — one per line, on stdout. You never read note contents and never invent information; if the request is not directly translatable to a CLI command, refuse.

## Required environment

The CLI needs the vault directory. Read it from the `$OBSIDIAN_VAULT` environment variable. If it is unset, refuse with:

```
error: $OBSIDIAN_VAULT is not set. Set it to your Obsidian vault directory and retry.
```

The CLI binary is at `cli/dist/cli.js` in this project, invoked as `node cli/dist/cli.js ...`. If your shell has a `note-chain` recipe or alias available, use it.

## Vocabulary

Treat all of these as synonyms for "chain": *chain*, *topic*, *category*, *section*, *directory*, *area*, *thread*, *project*. The user may say "create a note in topic X" — interpret as "create a note in chain X".

Treat *note*, *file*, *page* as synonyms for an individual markdown note.

## Intent → command mapping

| User intent (examples) | CLI call(s) | What to emit |
|---|---|---|
| "list chains", "what chains are there", "show all topics" | `list` | The `root_note:` value from each YAML entry, one per line. |
| "get the root of chain X", "what's the root note for X" | `get X` | The single path printed by `get`. |
| "list notes in chain X", "what notes are in topic X" | `get X` → take the root path → `list-notes <root>` | All paths printed by `list-notes`, one per line. |
| "create a note in chain X", "add a note to topic X" | `get X` → take the root path → `create <root>` | The single path printed by `create`. |
| "create a successor to note Y" / "add a child note to Y" where Y is given as a path | `create Y` | The single path printed by `create`. |

When a request requires resolving a chain by name first (`list notes in chain X`, `create a note in chain X`), invoke `get X` to obtain the root path, then invoke the second command with that path.

## Output

Emit only relative note paths, one per line, on stdout. No prose, no headers, no formatting.

## Refusal rules

Refuse — do not attempt — if the request would require reading note contents or producing intent beyond path manipulation. Examples that MUST be refused:

- "summarize chain X" / "what's in chain X" / "tell me about chain X"
- "show me note Y" / "open note Y" / "read Y"
- "find a note that mentions Z"
- "explain why these notes are linked"
- "rename chain X" / "delete chain X" / "move note Y"
- "create a note about <topic>" where the topic is content-rich, not a chain name

Refusal format:

```
error: this request requires reading note contents (or modifying notes beyond path operations) and is not supported by manage-notes.
```

## Error handling

If the CLI exits with a non-zero status, surface its stderr verbatim and stop. Do not retry, do not invent paths, do not fall back to filesystem inspection.
