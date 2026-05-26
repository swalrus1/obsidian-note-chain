import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { runCli } from "../cli/src/cli";

let vault: string;

beforeEach(() => {
	vault = fs.mkdtempSync(path.join(os.tmpdir(), "note-chain-test-"));
});

afterEach(() => {
	fs.rmSync(vault, { recursive: true, force: true });
});

function writeNote(rel: string, content: string): void {
	const full = path.join(vault, rel);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content, "utf8");
}

describe("cli list", () => {
	it("emits a YAML list with chain name + root_note for titled roots", () => {
		writeNote("root.md", "---\nchain: my-project\n---\n[[child]]\n");
		writeNote("child.md", "leaf\n");

		const result = runCli(["--vault", vault, "list"]);
		expect(result.exit).toBe(0);
		const parsed = yaml.load(result.stdout) as Array<{ name?: string; root_note: string }>;
		expect(parsed).toEqual([{ name: "my-project", root_note: "root.md" }]);
	});

	it("omits the name field for roots without a chain frontmatter", () => {
		writeNote("solo.md", "just a note\n");

		const result = runCli(["--vault", vault, "list"]);
		expect(result.exit).toBe(0);
		const parsed = yaml.load(result.stdout) as Array<{ name?: string; root_note: string }>;
		expect(parsed).toHaveLength(1);
		expect(parsed[0].root_note).toBe("solo.md");
		expect(parsed[0].name).toBeUndefined();
	});

	it("returns an empty YAML list for an empty vault", () => {
		const result = runCli(["--vault", vault, "list"]);
		expect(result.exit).toBe(0);
		expect(yaml.load(result.stdout)).toEqual([]);
	});
});

describe("cli get", () => {
	beforeEach(() => {
		writeNote("root.md", "---\nchain: my-project\n---\n");
		writeNote("other.md", "no chain\n");
	});

	it("returns the root path for an exact title match", () => {
		const result = runCli(["--vault", vault, "get", "my-project"]);
		expect(result.exit).toBe(0);
		expect(result.stdout.trim()).toBe("root.md");
	});

	it("returns the path for an exact relative-path fallback", () => {
		const result = runCli(["--vault", vault, "get", "other.md"]);
		expect(result.exit).toBe(0);
		expect(result.stdout.trim()).toBe("other.md");
	});

	it("fails with exit 2 when nothing matches", () => {
		const result = runCli(["--vault", vault, "get", "no-such-chain"]);
		expect(result.exit).toBe(2);
		expect(result.stderr).toMatch(/no chain found/);
	});

	it("fails with exit 2 when multiple chains share the same title", () => {
		writeNote("twin.md", "---\nchain: my-project\n---\n");

		const result = runCli(["--vault", vault, "get", "my-project"]);
		expect(result.exit).toBe(2);
		expect(result.stderr).toMatch(/multiple chains match/);
		expect(result.stderr).toContain("root.md");
		expect(result.stderr).toContain("twin.md");
	});

	it("does NOT match by basename", () => {
		// "root" is the basename of root.md but neither its title nor its relative path
		const result = runCli(["--vault", vault, "get", "root"]);
		expect(result.exit).toBe(2);
	});
});

describe("cli create", () => {
	beforeEach(() => {
		writeNote("parent.md", "I am the parent.\n");
	});

	it("creates a new note that links back to the parent and prints its path", () => {
		const result = runCli(["--vault", vault, "create", "parent.md"]);
		expect(result.exit).toBe(0);
		const created = result.stdout.trim();
		expect(created).toMatch(/^\d{14}\.md$/);
		const body = fs.readFileSync(path.join(vault, created), "utf8");
		expect(body).toBe("[[parent]]\n");
	});

	it("appends -N when filenames collide", () => {
		const r1 = runCli(["--vault", vault, "create", "parent.md"]);
		const r2 = runCli(["--vault", vault, "create", "parent.md"]);
		expect(r1.exit).toBe(0);
		expect(r2.exit).toBe(0);
		const first = r1.stdout.trim();
		const second = r2.stdout.trim();
		expect(first).not.toBe(second);
		// At least one of them has the -1 suffix
		const suffixed = [first, second].some((p) => /^\d{14}-1\.md$/.test(p));
		expect(suffixed).toBe(true);
	});

	it("fails with exit 2 when the parent does not exist", () => {
		const result = runCli(["--vault", vault, "create", "missing.md"]);
		expect(result.exit).toBe(2);
		expect(result.stderr).toMatch(/parent note not found/);
	});
});

describe("cli list-notes", () => {
	beforeEach(() => {
		writeNote("root.md", "[[child]]\n");
		writeNote("child.md", "[[grandchild]]\n");
		writeNote("grandchild.md", "leaf\n");
		writeNote("unrelated.md", "elsewhere\n");
	});

	it("prints all notes reachable from the root, one per line", () => {
		const result = runCli(["--vault", vault, "list-notes", "root.md"]);
		expect(result.exit).toBe(0);
		const lines = result.stdout.trim().split("\n").sort();
		expect(lines).toEqual(["child.md", "grandchild.md", "root.md"]);
	});

	it("fails with exit 2 when the note does not exist", () => {
		const result = runCli(["--vault", vault, "list-notes", "missing.md"]);
		expect(result.exit).toBe(2);
		expect(result.stderr).toMatch(/note not found/);
	});
});

describe("cli arg parsing", () => {
	it("fails with exit 1 when no command is given", () => {
		const result = runCli(["--vault", vault]);
		expect(result.exit).toBe(1);
	});

	it("fails with exit 1 when --vault is missing and OBSIDIAN_VAULT is unset", () => {
		const saved = process.env.OBSIDIAN_VAULT;
		delete process.env.OBSIDIAN_VAULT;
		try {
			const result = runCli(["list"]);
			expect(result.exit).toBe(1);
			expect(result.stderr).toMatch(/OBSIDIAN_VAULT/);
		} finally {
			if (saved !== undefined) process.env.OBSIDIAN_VAULT = saved;
		}
	});

	it("fails with exit 1 for an unknown command", () => {
		const result = runCli(["--vault", vault, "frobnicate"]);
		expect(result.exit).toBe(1);
		expect(result.stderr).toMatch(/unknown command/);
	});

	it("supports --vault=path equals form", () => {
		const result = runCli([`--vault=${vault}`, "list"]);
		expect(result.exit).toBe(0);
	});
});
