import { loadVault } from "../fs-vault";
import { buildLinkMaps } from "../../../core/buildLinkMaps";
import { chainNotes } from "../../../core/graph";
import type { CommandResult } from "./types";

export function runListNotes(vaultDir: string, args: string[]): CommandResult {
	if (args.length < 1) {
		return {
			stdout: "",
			stderr: "error: list-notes requires a <root-note-path> argument\n",
			exit: 1,
		};
	}
	const root = args[0];
	const data = loadVault(vaultDir);

	if (!data.files.includes(root)) {
		return {
			stdout: "",
			stderr: `error: note not found in vault: ${root}\n`,
			exit: 2,
		};
	}

	const linkMaps = buildLinkMaps(data.files, data.resolvedLinks);
	const notes = chainNotes(root, linkMaps.outLinks);
	return { stdout: notes.map((n) => n + "\n").join(""), exit: 0 };
}
