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
