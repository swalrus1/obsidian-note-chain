# Note Chain

An [Obsidian](https://obsidian.md) plugin that shows a side panel listing
all notes that have no backlinks — the "roots" of your knowledge graph.
Each root note is titled by the `thread` frontmatter field (resolved via
[Dataview](https://github.com/blacksmithgu/obsidian-dataview)).

## How to Use It?

Build and install into your vault:

```
npm run build
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/note-chain/
```

Then in Obsidian: **Settings → Community plugins → Note Chain → Enable**.

The panel opens automatically on the right sidebar. Use the command palette
(`Cmd+P`) to run **Link chain**, which fuzzy-searches all
root note titles and inserts a `[[wikilink]]` at the cursor.

## How to Contribute

Install dependencies (requires network access):

```
npm install
```

Build for development (watch mode):

```
npm run dev
```

Build for production:

```
npm run build
```
