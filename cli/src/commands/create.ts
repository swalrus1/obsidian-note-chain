import * as fs from "node:fs";
import * as path from "node:path";
import { loadVault } from "../fs-vault";
import type { CommandResult } from "./types";

function timestamp(now: Date = new Date()): string {
	return now.toISOString().replace(/\D/g, "").slice(0, 14);
}

function pickUniquePath(vaultAbs: string, ts: string): string {
	let name = `${ts}.md`;
	let i = 1;
	while (fs.existsSync(path.join(vaultAbs, name))) {
		name = `${ts}-${i}.md`;
		i++;
	}
	return name;
}

export function runCreate(vaultDir: string, args: string[]): CommandResult {
	if (args.length < 1) {
		return {
			stdout: "",
			stderr: "error: create requires a <parent-note-path> argument\n",
			exit: 1,
		};
	}
	const parentRel = args[0];
	const data = loadVault(vaultDir);

	if (!data.files.includes(parentRel)) {
		return {
			stdout: "",
			stderr: `error: parent note not found in vault: ${parentRel}\n`,
			exit: 2,
		};
	}

	const parentBasename = parentRel.split("/").pop()!.replace(/\.md$/, "");
	const ts = timestamp();
	const newRel = pickUniquePath(data.vaultDir, ts);
	const fullPath = path.join(data.vaultDir, newRel);
	fs.writeFileSync(fullPath, `[[${parentBasename}]]\n`, "utf8");

	return { stdout: newRel + "\n", exit: 0 };
}
