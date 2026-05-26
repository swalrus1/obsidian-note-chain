import { describe, it, expect } from "vitest";
import { buildLinkMaps } from "../core/buildLinkMaps";

describe("core/buildLinkMaps", () => {
	it("produces empty maps for an isolated note", () => {
		const { outLinks, inLinks } = buildLinkMaps(["a.md"], { "a.md": {} });
		expect([...outLinks.get("a.md")!]).toEqual([]);
		expect([...inLinks.get("a.md")!]).toEqual([]);
	});

	it("records a → b edge in both maps", () => {
		const { outLinks, inLinks } = buildLinkMaps(
			["a.md", "b.md"],
			{ "a.md": { "b.md": 1 } },
		);
		expect(outLinks.get("a.md")).toContain("b.md");
		expect(inLinks.get("b.md")).toContain("a.md");
	});

	it("ignores self-links", () => {
		const { outLinks } = buildLinkMaps(["a.md"], { "a.md": { "a.md": 1 } });
		expect([...outLinks.get("a.md")!]).toEqual([]);
	});

	it("ignores links to files not in the vault", () => {
		const { outLinks } = buildLinkMaps(["a.md"], { "a.md": { "ghost.md": 1 } });
		expect([...outLinks.get("a.md")!]).toEqual([]);
	});

	it("ensures both maps have entries for every file path", () => {
		const { outLinks, inLinks } = buildLinkMaps(["a.md", "b.md", "c.md"], {});
		expect(outLinks.has("a.md")).toBe(true);
		expect(outLinks.has("b.md")).toBe(true);
		expect(outLinks.has("c.md")).toBe(true);
		expect(inLinks.has("a.md")).toBe(true);
		expect(inLinks.has("b.md")).toBe(true);
		expect(inLinks.has("c.md")).toBe(true);
	});
});
