import { App, getAllTags, TFile } from "obsidian";

const LOG_PREFIX = "[note-chain]";

export interface LinkMaps {
	outLinks: Map<string, Set<string>>;
	inLinks: Map<string, Set<string>>;
}

export interface GraphData extends LinkMaps {
	rootNodes: string[];
	cycleRoots: string[];
}

export function normalizeChain(val: unknown): string[] {
	if (val === null || val === undefined) return [];
	if (Array.isArray(val)) return val.map((v) => String(v));
	return [String(val)];
}

export function basename(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

export function buildLinkMaps(app: App): LinkMaps {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const allFiles = app.vault.getMarkdownFiles();

	const outLinks = new Map<string, Set<string>>();
	const inLinks = new Map<string, Set<string>>();

	for (const file of allFiles) {
		if (!outLinks.has(file.path)) outLinks.set(file.path, new Set());
		if (!inLinks.has(file.path)) inLinks.set(file.path, new Set());
	}

	for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
		if (!outLinks.has(sourcePath)) continue;
		for (const targetPath of Object.keys(links)) {
			if (!outLinks.has(targetPath)) continue;
			if (targetPath === sourcePath) continue; // ignore self-links
			outLinks.get(sourcePath)!.add(targetPath);
			inLinks.get(targetPath)!.add(sourcePath);
		}
	}

	// Among notes sharing a tag, a newer note references all older notes with that tag.
	const tagToFiles = new Map<string, TFile[]>();
	for (const file of allFiles) {
		const cache = app.metadataCache.getCache(file.path);
		if (!cache) continue;
		for (const tag of getAllTags(cache) ?? []) {
			if (!tagToFiles.has(tag)) tagToFiles.set(tag, []);
			tagToFiles.get(tag)!.push(file);
		}
	}

	for (const files of tagToFiles.values()) {
		if (files.length < 2) continue;
		// Sort descending by ctime, with path as a deterministic tie-breaker.
		// Then add edges only between consecutive pairs — O(T log T) instead of O(T²).
		// Equal-ctime notes are ordered by path so the chain is never broken and
		// exactly one root exists per tag group.
		files.sort((a, b) => {
			const diff = b.stat.ctime - a.stat.ctime;
			return diff !== 0 ? diff : a.path.localeCompare(b.path);
		});
		for (let i = 1; i < files.length; i++) {
			outLinks.get(files[0].path)?.add(files[i].path);
			inLinks.get(files[i].path)?.add(files[0].path);
		}
	}

	return { outLinks, inLinks };
}

/**
 * Builds the reference graph and identifies roots of maximum inclusion chains
 * using Kosaraju's SCC algorithm. A maximum inclusion chain is a chain not
 * referenced by any note outside of it.
 * - Single-note SCC with no external references → root note (shown normally)
 * - Multi-note SCC with no external references → cyclic chain; one
 *   alphabetically-first representative is returned as the cycle root (shown in red)
 */
export function computeGraph(app: App): GraphData {
	const { outLinks, inLinks } = buildLinkMaps(app);
	const allNodes = Array.from(outLinks.keys());

	// Kosaraju pass 1: iterative DFS, record finish order
	const visited = new Set<string>();
	const finishOrder: string[] = [];

	for (const start of allNodes) {
		if (visited.has(start)) continue;
		const stack: [string, boolean][] = [[start, false]];
		while (stack.length > 0) {
			const top = stack[stack.length - 1];
			const [node, expanded] = top;
			if (!expanded) {
				if (visited.has(node)) { stack.pop(); continue; }
				visited.add(node);
				top[1] = true;
				for (const neighbor of outLinks.get(node) ?? []) {
					if (!visited.has(neighbor)) stack.push([neighbor, false]);
				}
			} else {
				stack.pop();
				finishOrder.push(node);
			}
		}
	}

	// Kosaraju pass 2: DFS on reversed graph in reverse finish order
	const component = new Map<string, number>();
	let compId = 0;

	for (let i = finishOrder.length - 1; i >= 0; i--) {
		const start = finishOrder[i];
		if (component.has(start)) continue;
		const stack: string[] = [start];
		while (stack.length > 0) {
			const node = stack.pop()!;
			if (component.has(node)) continue;
			component.set(node, compId);
			for (const neighbor of inLinks.get(node) ?? []) {
				if (!component.has(neighbor)) stack.push(neighbor);
			}
		}
		compId++;
	}

	// Group nodes by SCC and find source SCCs (no incoming edges from other SCCs)
	const sccs = new Map<number, string[]>();
	for (const [node, id] of component) {
		if (!sccs.has(id)) sccs.set(id, []);
		sccs.get(id)!.push(node);
	}

	const sccHasExternalParent = new Set<number>();
	for (const [srcPath, targets] of outLinks) {
		const srcComp = component.get(srcPath);
		if (srcComp === undefined) continue;
		for (const tgtPath of targets) {
			const dstComp = component.get(tgtPath);
			if (dstComp !== undefined && dstComp !== srcComp) {
				sccHasExternalParent.add(dstComp);
			}
		}
	}

	const rootNodes: string[] = [];
	const cycleRoots: string[] = [];

	for (const [id, nodes] of sccs) {
		if (sccHasExternalParent.has(id)) continue;

		if (nodes.length === 1) {
			rootNodes.push(nodes[0]);
		} else {
			nodes.sort((a, b) => basename(a).localeCompare(basename(b)));
			cycleRoots.push(nodes[0]);
		}
	}

	rootNodes.sort((a, b) => basename(a).localeCompare(basename(b)));
	cycleRoots.sort((a, b) => basename(a).localeCompare(basename(b)));

	return { rootNodes, cycleRoots, outLinks, inLinks };
}

/**
 * Compute the display title for the root of a maximum inclusion chain.
 *
 * Algorithm:
 * 1. Collect all notes in the chain via BFS from `rootPath`.
 * 2. A note is a candidate if it has a `chain` frontmatter property or any tag.
 * 3. A candidate X is eliminated if any other candidate Y can reach X through
 *    the chain graph (directly or through intermediate notes).
 * 4. Surviving candidate notes contribute their values (chain values + tags):
 *    - 0 surviving candidates → use the note's basename (caller falls back)
 *    - 1 surviving candidate  → use that candidate's value
 *    - 2+ surviving candidates → "chain collision: [A, B, ...]"
 */
export function computeTitle(
	rootPath: string,
	outLinks: Map<string, Set<string>>,
	inLinks: Map<string, Set<string>>,
	app: App
): string | null {
	try {
		// BFS to collect all notes in the chain (including root itself)
		const chain = new Set<string>([rootPath]);
		const queue = [rootPath];
		while (queue.length > 0) {
			const note = queue.shift()!;
			for (const referenced of outLinks.get(note) ?? []) {
				if (!chain.has(referenced)) {
					chain.add(referenced);
					queue.push(referenced);
				}
			}
		}

		// Collect chain values per note within the chain.
		// A note is a candidate if it has a chain property or any tag.
		const noteChains = new Map<string, string[]>();
		for (const path of chain) {
			const cache = app.metadataCache.getCache(path);
			const values = normalizeChain(cache?.frontmatter?.["chain"]);
			for (const tag of getAllTags(cache) ?? []) {
				values.push(tag);
			}
			if (values.length > 0) noteChains.set(path, values);
		}

		// Eliminate a candidate X if any other candidate Y can reach X
		// through the chain graph (directly or through intermediate notes).
		const candidatePaths = new Set(noteChains.keys());
		const eliminated = new Set<string>();
		for (const startPath of candidatePaths) {
			const visited = new Set<string>([startPath]);
			const bfsQueue = [startPath];
			while (bfsQueue.length > 0) {
				const current = bfsQueue.shift()!;
				for (const next of outLinks.get(current) ?? []) {
					if (!chain.has(next) || visited.has(next)) continue;
					visited.add(next);
					bfsQueue.push(next);
					if (candidatePaths.has(next)) {
						eliminated.add(next);
					}
				}
			}
		}

		// Surviving candidate notes contribute their values
		const candidates = new Set<string>();
		for (const [path, values] of noteChains) {
			if (!eliminated.has(path)) {
				for (const v of values) candidates.add(v);
			}
		}

		if (candidates.size === 0) return null;
		if (candidates.size === 1) return [...candidates][0];
		return `chain collision: [${[...candidates].sort().join(", ")}]`;
	} catch (e) {
		console.error(LOG_PREFIX, `Unexpected error computing title for "${rootPath}":`, e);
		return null;
	}
}

export function chainSize(rootPath: string, outLinks: Map<string, Set<string>>): number {
	const visited = new Set<string>([rootPath]);
	const queue = [rootPath];
	while (queue.length > 0) {
		const node = queue.shift()!;
		for (const neighbor of outLinks.get(node) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}
	return visited.size;
}
