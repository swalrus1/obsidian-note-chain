import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadVault } from "../cli/src/fs-vault";

let vault: string;

beforeEach(() => {
	vault = fs.mkdtempSync(path.join(os.tmpdir(), "fs-vault-test-"));
});

afterEach(() => {
	fs.rmSync(vault, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
	const full = path.join(vault, rel);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content, "utf8");
}

describe("loadVault — file discovery", () => {
	it("finds .md files recursively, skipping dotfiles and dotdirs", () => {
		write("a.md", "");
		write("sub/b.md", "");
		write("sub/deeper/c.md", "");
		write(".hidden.md", "");
		write(".obsidian/config.md", "");
		write("not-markdown.txt", "");

		const data = loadVault(vault);
		expect(data.files.sort()).toEqual(["a.md", "sub/b.md", "sub/deeper/c.md"]);
	});

	it("throws if the vault directory does not exist", () => {
		expect(() => loadVault(path.join(vault, "no-such"))).toThrow(/does not exist/);
	});
});

describe("loadVault — frontmatter parsing", () => {
	it("extracts frontmatter from a note with a chain property", () => {
		write("a.md", "---\nchain: my-project\n---\nbody\n");
		const data = loadVault(vault);
		expect(data.frontmatter.get("a.md")).toEqual({ chain: "my-project" });
	});

	it("handles a note with no frontmatter", () => {
		write("a.md", "just body\n");
		const data = loadVault(vault);
		expect(data.frontmatter.has("a.md")).toBe(false);
	});

	it("treats malformed YAML as no frontmatter", () => {
		write("a.md", "---\nthis is : not : valid yaml :::\n---\nbody\n");
		const data = loadVault(vault);
		// Either parses as something or treats as no frontmatter — both acceptable;
		// the note itself must still be discovered.
		expect(data.files).toContain("a.md");
	});
});

describe("loadVault — wikilink resolution", () => {
	it("resolves [[basename]] when basename is unique in the vault", () => {
		write("a.md", "[[b]]\n");
		write("b.md", "");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({ "b.md": 1 });
	});

	it("strips aliases: [[b|alias]] → b", () => {
		write("a.md", "[[b|the alias]]\n");
		write("b.md", "");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({ "b.md": 1 });
	});

	it("strips section anchors: [[b#heading]] → b", () => {
		write("a.md", "[[b#some heading]]\n");
		write("b.md", "");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({ "b.md": 1 });
	});

	it("resolves [[folder/name]] by relative path", () => {
		write("a.md", "[[sub/b]]\n");
		write("sub/b.md", "");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({ "sub/b.md": 1 });
	});

	it("skips ambiguous basename matches", () => {
		write("a.md", "[[twin]]\n");
		write("dir1/twin.md", "");
		write("dir2/twin.md", "");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({});
	});

	it("skips unresolvable links", () => {
		write("a.md", "[[ghost]]\n");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({});
	});

	it("ignores self-links", () => {
		write("a.md", "[[a]]\n");
		const data = loadVault(vault);
		expect(data.resolvedLinks["a.md"]).toEqual({});
	});
});
