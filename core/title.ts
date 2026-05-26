import { chainNotes, normalizeChain } from "./graph";
import { FrontmatterReader } from "./types";

/**
 * Compute the display title for the root of a maximum inclusion chain.
 *
 * Algorithm:
 * 1. Collect all notes in the chain via BFS over outLinks from `rootPath`.
 * 2. A note is a candidate if it has a `chain` frontmatter property.
 * 3. Candidate X is eliminated if any other candidate Y can reach X through
 *    the chain graph (directly or transitively).
 * 4. Surviving candidates contribute their chain values:
 *    - 0 surviving → return null (caller falls back to basename).
 *    - 1 surviving → return that value.
 *    - 2+ surviving → return "chain collision: [a, b, ...]" (sorted).
 *
 * Pure: parameterised over a frontmatter reader.
 */
export function computeTitle(
	rootPath: string,
	outLinks: Map<string, Set<string>>,
	getFrontmatter: FrontmatterReader
): string | null {
	const chain = new Set(chainNotes(rootPath, outLinks));

	const noteChains = new Map<string, string[]>();
	for (const path of chain) {
		const fm = getFrontmatter(path);
		const values = normalizeChain(fm?.["chain"]);
		if (values.length > 0) noteChains.set(path, values);
	}

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

	const surviving = new Set<string>();
	for (const [path, values] of noteChains) {
		if (!eliminated.has(path)) {
			for (const v of values) surviving.add(v);
		}
	}

	if (surviving.size === 0) return null;
	if (surviving.size === 1) return [...surviving][0];
	return `chain collision: [${[...surviving].sort().join(", ")}]`;
}
