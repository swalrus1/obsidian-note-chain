# Note Chain

An [Obsidian](https://obsidian.md) plugin that shows a side panel listing
the roots of maximum-inclusion note chains — notes whose chain is not
referenced from outside it. Cycle representatives are shown in red.
Each root note is titled by its `chain` frontmatter field.

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
