import { loadVault } from "../fs-vault";
import { buildLinkMaps } from "../../../core/buildLinkMaps";
import { computeGraph } from "../../../core/graph";
import { computeTitle } from "../../../core/title";
import type { CommandResult } from "./types";

export function runGet(vaultDir: string, args: string[]): CommandResult {
	if (args.length < 1) {
		return { stdout: "", stderr: "error: get requires a <name> argument\n", exit: 1 };
	}
	const name = args[0];
	const data = loadVault(vaultDir);
	const linkMaps = buildLinkMaps(data.files, data.resolvedLinks);
	const { rootNodes } = computeGraph(linkMaps);

	const matches: string[] = [];
	for (const root of rootNodes) {
		const title = computeTitle(
			root,
			linkMaps.outLinks,
			(p) => data.frontmatter.get(p) ?? null,
		);
		if (title === name) matches.push(root);
	}

	if (matches.length === 1) {
		return { stdout: matches[0] + "\n", exit: 0 };
	}
	if (matches.length > 1) {
		const list = matches.map((m) => `  - ${m}`).join("\n");
		return {
			stdout: "",
			stderr: `error: multiple chains match title "${name}":\n${list}\n`,
			exit: 2,
		};
	}

	if (rootNodes.includes(name)) {
		return { stdout: name + "\n", exit: 0 };
	}

	return {
		stdout: "",
		stderr: `error: no chain found with name "${name}"\n`,
		exit: 2,
	};
}
