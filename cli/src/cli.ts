import { runList } from "./commands/list";
import { runGet } from "./commands/get";
import { runCreate } from "./commands/create";
import { runListNotes } from "./commands/list-notes";
import type { CommandResult } from "./commands/types";

interface ParsedArgs {
	command: string | null;
	positional: string[];
	vault: string | undefined;
	showHelp: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
	let command: string | null = null;
	const positional: string[] = [];
	let vault: string | undefined = process.env.OBSIDIAN_VAULT;
	let showHelp = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--vault" || a === "-v") {
			vault = argv[++i];
		} else if (a.startsWith("--vault=")) {
			vault = a.slice("--vault=".length);
		} else if (a === "--help" || a === "-h") {
			showHelp = true;
		} else if (!command) {
			command = a;
		} else {
			positional.push(a);
		}
	}

	return { command, positional, vault, showHelp };
}

const USAGE = [
	"Usage: note-chain [--vault <path>] <command> [args]",
	"",
	"Commands:",
	"  list                       YAML list of chains (name + root_note)",
	"  get <name>                 Print the root note path for a chain by name",
	"  create <parent-note-path>  Create a new note that references the parent note",
	"  list-notes <root-path>     Print all notes in the chain rooted at the given path",
	"",
	"Vault may also be specified via the OBSIDIAN_VAULT environment variable.",
	"",
].join("\n");

export function runCli(argv: string[]): CommandResult {
	const { command, positional, vault, showHelp } = parseArgs(argv);

	if (showHelp) {
		return { stdout: USAGE, exit: 0 };
	}
	if (!command) {
		return { stdout: "", stderr: USAGE, exit: 1 };
	}
	if (!vault) {
		return {
			stdout: "",
			stderr: "error: --vault <path> or OBSIDIAN_VAULT env var required\n",
			exit: 1,
		};
	}

	try {
		switch (command) {
			case "list":
				return runList(vault);
			case "get":
				return runGet(vault, positional);
			case "create":
				return runCreate(vault, positional);
			case "list-notes":
				return runListNotes(vault, positional);
			default:
				return {
					stdout: "",
					stderr: `error: unknown command "${command}"\n${USAGE}`,
					exit: 1,
				};
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { stdout: "", stderr: `error: ${msg}\n`, exit: 3 };
	}
}

function main(): void {
	const result = runCli(process.argv.slice(2));
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exit(result.exit);
}

if (require.main === module) {
	main();
}
