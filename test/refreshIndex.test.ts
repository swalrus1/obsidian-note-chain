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

	it("lists tagged notes as wikilinks in the tag index", async () => {
		const app = buildMutableApp({
			files: [mkFile("note-a.md"), mkFile("note-b.md")],
			caches: {
				"note-a.md": { _tags: ["#project"] },
				"note-b.md": { _tags: ["#project"] },
			},
		});

		await refreshIndex(app as never);

		const content = tagContent(app, "internal/index/tag/project")!;
		expect(content).toContain("- project - [[note-a]]");
		expect(content).toContain("- project - [[note-b]]");
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

		// idx.md is an existing index note → it should be overwritten (modified), not create a dupe
		// and it must NOT appear in its own tag list
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

		// create should NOT have been called for the tag index
		expect(app.vault.created.some(r => r.content.includes('chain: "internal/index/tag/alpha"'))).toBe(false);
		expect(app.vault.modified.some(r => r.content.includes('chain: "internal/index/tag/alpha"'))).toBe(true);
	});
});

// ── master index ──────────────────────────────────────────────────────────────

describe("refreshIndex – master index", () => {
	it("creates a master index listing tag index notes", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md")],
			caches: { "note.md": { _tags: ["#foo"] } },
		});

		await refreshIndex(app as never);

		const master = tagContent(app, "internal/index")!;
		expect(master).toBeDefined();
		expect(master).toContain("internal/index");
	});

	it("includes newly created tag index files in the master index", async () => {
		const app = buildMutableApp({
			files: [mkFile("note.md")],
			caches: { "note.md": { _tags: ["#bar"] } },
		});

		await refreshIndex(app as never);

		const master = tagContent(app, "internal/index")!;
		// The tag index filename (timestamp) should appear in the master wikilink list
		expect(master).toMatch(/\[\[.+\]\]/);
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
