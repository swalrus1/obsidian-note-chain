import { describe, it, expect } from "vitest";
import { buildLinkMaps } from "../src/graph";
import { buildApp, mkFile } from "./helpers";

describe("buildLinkMaps – explicit links", () => {
	it("produces empty maps for an isolated note", () => {
		const app = buildApp({ files: [mkFile("a.md")] });
		const { outLinks, inLinks } = buildLinkMaps(app as never);
		expect([...outLinks.get("a.md")!]).toEqual([]);
		expect([...inLinks.get("a.md")!]).toEqual([]);
	});

	it("records a → b edge in both maps", () => {
		const app = buildApp({
			files: [mkFile("a.md"), mkFile("b.md")],
			links: { "a.md": ["b.md"] },
		});
		const { outLinks, inLinks } = buildLinkMaps(app as never);
		expect(outLinks.get("a.md")).toContain("b.md");
		expect(inLinks.get("b.md")).toContain("a.md");
	});

	it("ignores self-links", () => {
		const app = buildApp({
			files: [mkFile("a.md")],
			links: { "a.md": ["a.md"] },
		});
		const { outLinks } = buildLinkMaps(app as never);
		expect([...outLinks.get("a.md")!]).toEqual([]);
	});

	it("ignores links to files not in the vault", () => {
		const app = buildApp({
			files: [mkFile("a.md")],
			links: { "a.md": ["ghost.md"] },
		});
		const { outLinks } = buildLinkMaps(app as never);
		expect([...outLinks.get("a.md")!]).toEqual([]);
	});
});

describe("buildLinkMaps – tag-based edges", () => {
	it("adds newer → older edge for two notes sharing a tag", () => {
		const app = buildApp({
			files: [mkFile("old.md", 1), mkFile("new.md", 2)],
			caches: {
				"old.md": { _tags: ["#project"] },
				"new.md": { _tags: ["#project"] },
			},
		});
		const { outLinks, inLinks } = buildLinkMaps(app as never);
		expect(outLinks.get("new.md")).toContain("old.md");
		expect(inLinks.get("old.md")).toContain("new.md");
	});

	it("does NOT add reverse edge (older does not reference newer)", () => {
		const app = buildApp({
			files: [mkFile("old.md", 1), mkFile("new.md", 2)],
			caches: {
				"old.md": { _tags: ["#project"] },
				"new.md": { _tags: ["#project"] },
			},
		});
		const { outLinks } = buildLinkMaps(app as never);
		expect(outLinks.get("old.md")).not.toContain("new.md");
	});

	it("adds an edge ordered by path when two notes share a tag and have equal ctime", () => {
		// Equal ctime: path tie-breaker applies (a.md < b.md), so a.md → b.md.
		const app = buildApp({
			files: [mkFile("a.md", 5), mkFile("b.md", 5)],
			caches: {
				"a.md": { _tags: ["#same"] },
				"b.md": { _tags: ["#same"] },
			},
		});
		const { outLinks, inLinks } = buildLinkMaps(app as never);
		expect(outLinks.get("a.md")).toContain("b.md");
		expect(inLinks.get("b.md")).toContain("a.md");
	});

	it("newest note is the star hub: links directly to all other tag-mates", () => {
		// newest(3) is the star hub: newest → mid and newest → old.
		// mid does NOT link to old (only the hub links outward).
		const app = buildApp({
			files: [mkFile("old.md", 1), mkFile("mid.md", 2), mkFile("new.md", 3)],
			caches: {
				"old.md": { _tags: ["#t"] },
				"mid.md": { _tags: ["#t"] },
				"new.md": { _tags: ["#t"] },
			},
		});
		const { outLinks } = buildLinkMaps(app as never);
		// Hub (newest) links directly to every other note in the group
		expect(outLinks.get("new.md")).toContain("mid.md");
		expect(outLinks.get("new.md")).toContain("old.md");
		// Non-hub notes do not add tag-based edges
		expect(outLinks.get("mid.md")).not.toContain("old.md");
	});

	it("never breaks the chain for middle-tier notes with equal ctime", () => {
		// [A(3), B(2), C(2), D(1)] — B and C tie. Without a tie-breaker the B-C edge
		// would be skipped, leaving C with no incoming edge and making it a spurious root.
		const app = buildApp({
			files: [mkFile("a.md", 3), mkFile("b.md", 2), mkFile("c.md", 2), mkFile("d.md", 1)],
			caches: {
				"a.md": { _tags: ["#t"] },
				"b.md": { _tags: ["#t"] },
				"c.md": { _tags: ["#t"] },
				"d.md": { _tags: ["#t"] },
			},
		});
		const { inLinks } = buildLinkMaps(app as never);
		// Every note except the root must have at least one incoming tag edge.
		expect(inLinks.get("b.md")!.size).toBeGreaterThan(0);
		expect(inLinks.get("c.md")!.size).toBeGreaterThan(0);
		expect(inLinks.get("d.md")!.size).toBeGreaterThan(0);
	});

	it("handles notes with multiple tags independently", () => {
		const app = buildApp({
			files: [mkFile("a.md", 1), mkFile("b.md", 2), mkFile("c.md", 3)],
			caches: {
				"a.md": { _tags: ["#x"] },
				"b.md": { _tags: ["#x", "#y"] },
				"c.md": { _tags: ["#y"] },
			},
		});
		const { outLinks } = buildLinkMaps(app as never);
		// #x chain: b(2) → a(1)
		expect(outLinks.get("b.md")).toContain("a.md");
		// #y chain: c(3) → b(2)
		expect(outLinks.get("c.md")).toContain("b.md");
	});
});
