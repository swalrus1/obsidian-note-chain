import { LinkMaps, GraphData } from "./types";

export function basename(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

export function normalizeChain(val: unknown): string[] {
	if (val === null || val === undefined) return [];
	if (Array.isArray(val)) return val.map((v) => String(v));
	return [String(val)];
}

/**
 * Identify roots of maximum inclusion chains using Kosaraju's SCC algorithm.
 * A maximum inclusion chain is a chain not referenced from outside.
 * - Single-note source SCC → root note
 * - Multi-note source SCC  → cycle root (alphabetically-first node by basename)
 *
 * Pure: takes already-built link maps, returns roots + the same maps.
 */
export function computeGraph({ outLinks, inLinks }: LinkMaps): GraphData {
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

/** BFS over outLinks from a root path; returns the set of reachable notes (inclusive). */
export function chainNotes(rootPath: string, outLinks: Map<string, Set<string>>): string[] {
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
	return [...chain];
}

export function chainSize(rootPath: string, outLinks: Map<string, Set<string>>): number {
	return chainNotes(rootPath, outLinks).length;
}
