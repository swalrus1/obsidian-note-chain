import { App } from "obsidian";
import { computeGraph, computeTitle, resolveAndSortByCtime } from "./graph";

const LOG_PREFIX = "[note-chain]";

/**
 * In-memory index: display title → file path.
 * Rebuilt on every vault change that may affect the chain graph.
 */
export class TitleStore {
	readonly map: Map<string, string> = new Map();

	rebuild(app: App): void {
		try {
			const { rootNodes, cycleRoots, outLinks, inLinks } = computeGraph(app);

			this.map.clear();

			for (const file of resolveAndSortByCtime([...rootNodes, ...cycleRoots], app)) {
				const title = computeTitle(file.path, outLinks, inLinks, app) ?? file.basename;
				this.map.set(title, file.path);
			}
		} catch (e) {
			console.error(LOG_PREFIX, "Failed to rebuild title store:", e);
		}
	}
}
