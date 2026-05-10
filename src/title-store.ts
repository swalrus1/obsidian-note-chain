import { App, TFile } from "obsidian";
import { computeGraph, computeTitle } from "./graph";

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

			for (const path of [...rootNodes, ...cycleRoots]) {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) {
					console.warn(LOG_PREFIX, `Expected a TFile at path "${path}" but got none.`);
					continue;
				}
				const title = computeTitle(path, outLinks, inLinks, app) ?? file.basename;
				this.map.set(title, path);
			}
		} catch (e) {
			console.error(LOG_PREFIX, "Failed to rebuild title store:", e);
		}
	}
}
