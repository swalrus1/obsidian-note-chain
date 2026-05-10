import { App, getAllTags, Notice } from "obsidian";
import type { TFile } from "obsidian";

const EPIGRAPH =
	`*This note is an index managed by plugin "Note Chain". ` +
	`Call "Note Chain: Refresh index" to refresh this note.*`;

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
	const tagIndexFiles: TFile[] = [];
	for (const [tag, notes] of tagMap) {
		const chainValue = `internal/index/tag/${tag}`;
		assertUnique(app, chainValue);
		const existing = findByChain(app, chainValue);
		const content = buildTagContent(tag, chainValue, notes);
		const file = existing.length === 1
			? await overwrite(app, existing[0], content)
			: await createUnique(app, content);
		tagIndexFiles.push(file);
	}

	// 3. Create or update master index
	const masterChain = "internal/index";
	assertUnique(app, masterChain);
	const masterExisting = findByChain(app, masterChain);

	// Combine notes already indexed in the cache (orphaned from deleted tags)
	// with the ones we just wrote (not yet reflected in the cache).
	const allIndexFiles = dedupe([
		...findByChainPrefix(app, "internal/index/"),
		...tagIndexFiles,
	]);
	const masterContent = buildMasterContent(masterChain, allIndexFiles);

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

function dedupe(files: TFile[]): TFile[] {
	const seen = new Set<string>();
	return files.filter(f => !seen.has(f.path) && seen.add(f.path) as unknown as boolean);
}

function frontmatter(chainValue: string): string {
	return `---\nchain: "${chainValue}"\n---`;
}

function buildTagContent(tag: string, chainValue: string, notes: TFile[]): string {
	const list = notes.map(f => `- ${tag} - [[${f.basename}]]`).sort().join("\n");
	return [frontmatter(chainValue), "", EPIGRAPH, "", `## Tag: ${tag}`, "", list, ""].join("\n");
}

function buildMasterContent(chainValue: string, files: TFile[]): string {
	const list = files.map(f => `- [[${f.basename}]]`).sort().join("\n");
	return [frontmatter(chainValue), "", EPIGRAPH, "", `## Tag indices`, "", list, ""].join("\n");
}
