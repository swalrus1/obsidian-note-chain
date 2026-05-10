import { App, getAllTags, Notice } from "obsidian";
import type { TFile } from "obsidian";

const EPIGRAPH =
	`*This note is an index managed by plugin "Note Chain". ` +
	`Call "Note Chain: Refresh index" to refresh this note.*`;

type TagEntry = { file: TFile; tag: string };

export async function refreshIndex(app: App): Promise<void> {
	// 1. Build tag → files map (skip notes that are themselves index notes)
	const tagMap = new Map<string, TFile[]>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getCache(file.path);
		if (!cache) continue;
		const chain: unknown = (cache as { frontmatter?: Record<string, unknown> })?.frontmatter?.chain;
		if (typeof chain === "string" && chain.startsWith("internal/index")) continue;
		for (const raw of getAllTags(cache) ?? []) {
			const tag = raw.slice(1); // strip leading #
			if (!tagMap.has(tag)) tagMap.set(tag, []);
			tagMap.get(tag)!.push(file);
		}
	}

	// 2. Create or update one index note per tag
	const tagEntries: TagEntry[] = [];
	for (const [tag, notes] of tagMap) {
		const chainValue = `internal/index/tag/${tag}`;
		assertUnique(app, chainValue);
		const existing = findByChain(app, chainValue);
		const content = await buildTagContent(app, tag, chainValue, notes);
		const file = existing.length === 1
			? await overwrite(app, existing[0], content)
			: await createUnique(app, content);
		tagEntries.push({ file, tag });
	}

	// 3. Create or update master index
	const masterChain = "internal/index";
	assertUnique(app, masterChain);
	const masterExisting = findByChain(app, masterChain);

	// Include orphaned pre-existing sub-index notes (tags since deleted from vault).
	// Newly written tag index files are not yet in the cache, so merge explicitly.
	const orphaned: TagEntry[] = findByChainPrefix(app, "internal/index/")
		.filter(f => !tagEntries.some(e => e.file.path === f.path))
		.map(f => {
			const chain = app.metadataCache.getCache(f.path)?.frontmatter?.chain as string ?? "";
			const tag = chain.startsWith("internal/index/tag/") ? chain.slice("internal/index/tag/".length) : "";
			return { file: f, tag };
		});
	const allEntries = dedupeEntries([...orphaned, ...tagEntries]);

	const masterContent = buildMasterContent(masterChain, allEntries);
	if (masterExisting.length === 1) {
		await overwrite(app, masterExisting[0], masterContent);
	} else {
		await createUnique(app, masterContent);
	}

	new Notice("[Note Chain] Index refreshed.");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function findByChain(app: App, value: string): TFile[] {
	return app.vault.getMarkdownFiles().filter(
		f => app.metadataCache.getCache(f.path)?.frontmatter?.chain === value
	);
}

function findByChainPrefix(app: App, prefix: string): TFile[] {
	return app.vault.getMarkdownFiles().filter(f => {
		const chain = app.metadataCache.getCache(f.path)?.frontmatter?.chain;
		return typeof chain === "string" && chain.startsWith(prefix);
	});
}

function assertUnique(app: App, chainValue: string): void {
	const matches = findByChain(app, chainValue);
	if (matches.length > 1) {
		const msg =
			`Multiple notes have chain="${chainValue}". ` +
			`Give each a unique chain value, then call "Refresh index" again.`;
		new Notice(`[Note Chain] ${msg}`);
		throw new Error(msg);
	}
}

async function createUnique(app: App, content: string): Promise<TFile> {
	const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
	let path = `${ts}.md`;
	for (let i = 1; app.vault.getAbstractFileByPath(path); i++) {
		path = `${ts}-${i}.md`;
	}
	return app.vault.create(path, content);
}

async function overwrite(app: App, file: TFile, content: string): Promise<TFile> {
	await app.vault.modify(file, content);
	return file;
}

function dedupeEntries(entries: TagEntry[]): TagEntry[] {
	const seen = new Set<string>();
	return entries.filter(e => !seen.has(e.file.path) && seen.add(e.file.path) as unknown as boolean);
}

function frontmatter(chainValue: string): string {
	return `---\nchain: "${chainValue}"\n---`;
}

async function getFirstLine(app: App, file: TFile): Promise<string> {
	const content = await app.vault.cachedRead(file);
	const lines = content.split("\n");
	let i = 0;
	// Skip YAML frontmatter block
	if (lines[0]?.trimEnd() === "---") {
		i = 1;
		while (i < lines.length && lines[i]?.trimEnd() !== "---") i++;
		i++;
	}
	// Find first non-empty line
	while (i < lines.length && !lines[i]?.trim()) i++;
	const line = lines[i]?.trim() ?? "";
	if (!line) return "";
	return line.length > 80 ? line.slice(0, 80) + "..." : line;
}

async function buildTagContent(app: App, tag: string, chainValue: string, notes: TFile[]): Promise<string> {
	const lines = await Promise.all(
		notes.map(async f => {
			const first = await getFirstLine(app, f);
			return first ? `- [[${f.basename}]] - ${first}` : `- [[${f.basename}]]`;
		})
	);
	lines.sort();
	return [frontmatter(chainValue), "", EPIGRAPH, "", `## Tag: ${tag}`, "", lines.join("\n"), ""].join("\n");
}

function buildMasterContent(chainValue: string, entries: TagEntry[]): string {
	const list = entries
		.map(({ file, tag }) => tag ? `- [[${file.basename}]] - ${tag}` : `- [[${file.basename}]]`)
		.sort()
		.join("\n");
	return [frontmatter(chainValue), "", EPIGRAPH, "", `## Tag indices`, "", list, ""].join("\n");
}
