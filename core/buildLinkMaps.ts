import { LinkMaps, ResolvedLinks } from "./types";

/**
 * Build forward and reverse adjacency maps from a list of file paths
 * and an Obsidian-style resolvedLinks object.
 *
 * Pure: no Obsidian dependencies. The plugin and CLI wire their respective
 * data sources to this function.
 */
export function buildLinkMaps(filePaths: string[], resolvedLinks: ResolvedLinks): LinkMaps {
	const outLinks = new Map<string, Set<string>>();
	const inLinks = new Map<string, Set<string>>();

	for (const path of filePaths) {
		if (!outLinks.has(path)) outLinks.set(path, new Set());
		if (!inLinks.has(path)) inLinks.set(path, new Set());
	}

	for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
		if (!outLinks.has(sourcePath)) continue;
		for (const targetPath of Object.keys(links)) {
			if (!outLinks.has(targetPath)) continue;
			if (targetPath === sourcePath) continue;
			outLinks.get(sourcePath)!.add(targetPath);
			inLinks.get(targetPath)!.add(sourcePath);
		}
	}

	return { outLinks, inLinks };
}
