import { describe, it, expect } from "vitest";
import { refreshIndex } from "../src/index-builder";
import { buildMutableApp, mkFile } from "./helpers";

// ── helpers ───────────────────────────────────────────────────────────────────

function tagContent(app: ReturnType<typeof buildMutableApp>, chainValue: string): string | undefined {
	return [
		...app.vault.created.map(r => r.content),
		...app.vault.modified.map(r => r.content),
	].find(c => c.includes(`chain: "${chainValue}"`));
}

// ── tag index creation ────────────────────────────────────────────────────────

describe("refreshIndex – tag indices", () => {
	it("creates a tag index note for each tag found in the vault", async () => {
		const app = buildMutableApp({
			files: [mkFile("a.md"), mkFile("b.md")],
			caches: {
				"a.md": { _tags: ["#foo"] },
				"b.md": { _tags: ["#bar"] },
			},
		});

		await refreshIndex(app as never);

		const chains = [...app.vault.created, ...app.vault.modified].map(r => r.content);
		expect(chains.some(c => c.includes('chain: "internal/index/tag/foo"'))).toBe(true);
		expect(chains.some(c => c.includes('chain: "internal/index/tag/bar"'))).toBe(true);
	});

	it("lists tagged notes with first-line content", async () => {
		const app = buildMutableApp({
			files: [mkFile("note-a.md"), mkFile("note-b.md")],
			caches: {
				"note-a.md": { _tags: ["#project"] },
				"note-b.md": { _tags: ["#project"] },
			},
			contents: {
				"note-a.md": "First line of A\nSecond line",
				"note-b.md": "First line of B\nSecond line",
			},
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/project")!;
		expect(content).toContain("- [[note-a]] - First line of A");
		expect(content).toContain("- [[note-b]] - First line of B");
	});

	it("omits the dash separator when a note has no first line", async () => {
		const app = buildMutableApp({
			files: [mkFile("empty.md")],
			caches: { "empty.md": { _tags: ["#x"] } },
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/x")!;
		expect(content).toContain("- [[empty]]");
		expect(content).not.toContain("- [[empty]] -");
	});

	it("truncates first lines longer than 80 characters", async () => {
		const longLine = "A".repeat(90);
		const app = buildMutableApp({
			files: [mkFile("long.md")],
			caches: { "long.md": { _tags: ["#t"] } },
			contents: { "long.md": longLine },
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/t")!;
		expect(content).toContain("- [[long]] - " + "A".repeat(80) + "...");
	});

	it("skips YAML frontmatter when reading the first line", async () => {
		const app = buildMutableApp({
			files: [mkFile("fm.md")],
			caches: { "fm.md": { _tags: ["#t"] } },
			contents: { "fm.md": "---\nchain: foo\n---\n\nActual first line" },
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/t")!;
		expect(content).toContain("- [[fm]] - Actual first line");
	});

	it("includes the managed epigraph in tag index notes", async () => {
		const app = buildMutableApp({
			files: [mkFile("x.md")],
			caches: { "x.md": { _tags: ["#mytag"] } },
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/mytag")!;
		expect(content).toContain("*This note is an index");
		expect(content).not.toContain("> *");
	});

	it("skips notes whose chain starts with internal/index when building tag map", async () => {
		const app = buildMutableApp({
			files: [mkFile("real.md"), mkFile("idx.md")],
			caches: {
				"real.md": { _tags: ["#project"] },
				"idx.md": {
					frontmatter: { chain: "internal/index/tag/project" },
					_tags: ["#project"],
				},
			},
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/project")!;
		expect(content).not.toContain("[[idx]]");
		expect(content).toContain("[[real]]");
	});

	it("overwrites an existing tag index note instead of creating a new one", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md"), mkFile("existing-idx.md")],
			caches: {
				"note.md": { _tags: ["#alpha"] },
				"existing-idx.md": { frontmatter: { chain: "internal/index/tag/alpha" } },
			},
		});

		await refreshIndex(app as never);

		expect(app.vault.created.some(r => r.content.includes('chain: "internal/index/tag/alpha"'))).toBe(false);
		expect(app.vault.modified.some(r => r.content.includes('chain: "internal/index/tag/alpha"'))).toBe(true);
	});
});

// ── master index ──────────────────────────────────────────────────────────────

describe("refreshIndex – master index", () => {
	it("lists tag index notes with their tag name", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md")],
			caches: { "note.md": { _tags: ["#bar"] } },
		});

		await refreshIndex(app as never);

		const master = tagContent(app, "internal/index")!;
		expect(master).toMatch(/- \[\[.+\]\] - bar/);
	});

	it("overwrites an existing master index note", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md"), mkFile("master.md")],
			caches: {
				"note.md": { _tags: ["#foo"] },
				"master.md": { frontmatter: { chain: "internal/index" } },
			},
		});

		await refreshIndex(app as never);

		expect(app.vault.modified.some(r => r.path === "master.md")).toBe(true);
		expect(app.vault.created.some(r => r.content.includes('chain: "internal/index"'))).toBe(false);
	});
});

// ── error cases ───────────────────────────────────────────────────────────────

describe("refreshIndex – duplicate chain values", () => {
	it("throws when two notes share the same tag chain value", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md"), mkFile("idx1.md"), mkFile("idx2.md")],
			caches: {
				"note.md": { _tags: ["#dup"] },
				"idx1.md": { frontmatter: { chain: "internal/index/tag/dup" } },
				"idx2.md": { frontmatter: { chain: "internal/index/tag/dup" } },
			},
		});

		await expect(refreshIndex(app as never)).rejects.toThrow(/chain="internal\/index\/tag\/dup"/);
	});

	it("throws when two notes share the master index chain value", async () => {
		const app = buildMutableApp({
			files: [mkFile("m1.md"), mkFile("m2.md")],
			caches: {
				"m1.md": { frontmatter: { chain: "internal/index" } },
				"m2.md": { frontmatter: { chain: "internal/index" } },
			},
		});

		await expect(refreshIndex(app as never)).rejects.toThrow(/chain="internal\/index"/);
	});
});
