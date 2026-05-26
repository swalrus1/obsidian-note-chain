import * as yaml from "js-yaml";
import { loadVault } from "../fs-vault";
import { buildLinkMaps } from "../../../core/buildLinkMaps";
import { computeGraph } from "../../../core/graph";
import { computeTitle } from "../../../core/title";
import type { CommandResult } from "./types";

export function runList(vaultDir: string): CommandResult {
	const data = loadVault(vaultDir);
	const linkMaps = buildLinkMaps(data.files, data.resolvedLinks);
	const { rootNodes } = computeGraph(linkMaps);

	const entries: Array<{ name?: string; root_note: string }> = [];
	for (const root of rootNodes) {
		const title = computeTitle(
			root,
			linkMaps.outLinks,
			(p) => data.frontmatter.get(p) ?? null,
		);
		if (title !== null) entries.push({ name: title, root_note: root });
		else entries.push({ root_note: root });
	}

	return { stdout: yaml.dump(entries), exit: 0 };
}
