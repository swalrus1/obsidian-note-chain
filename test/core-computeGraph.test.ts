import { describe, it, expect } from "vitest";
import { buildLinkMaps } from "../core/buildLinkMaps";
import { computeGraph } from "../core/graph";

function maps(files: string[], links: Record<string, string[]> = {}) {
	const resolved: Record<string, Record<string, number>> = {};
	for (const f of files) resolved[f] = {};
	for (const [src, tgts] of Object.entries(links)) {
		for (const t of tgts) {
			resolved[src] ??= {};
			resolved[src][t] = 1;
		}
	}
	return buildLinkMaps(files, resolved);
}

describe("core/computeGraph – root detection", () => {
	it("isolated note is a root", () => {
		const { rootNodes, cycleRoots } = computeGraph(maps(["a.md"]));
		expect(rootNodes).toEqual(["a.md"]);
		expect(cycleRoots).toEqual([]);
	});

	it("a note referenced from outside is not a root", () => {
		const { rootNodes } = computeGraph(
			maps(["root.md", "child.md"], { "root.md": ["child.md"] }),
		);
		expect(rootNodes).toEqual(["root.md"]);
	});
});

describe("core/computeGraph – cycles", () => {
	it("a two-note cycle yields one cycle root and no regular root", () => {
		const { rootNodes, cycleRoots } = computeGraph(
			maps(["a.md", "b.md"], { "a.md": ["b.md"], "b.md": ["a.md"] }),
		);
		expect(rootNodes).toEqual([]);
		expect(cycleRoots).toHaveLength(1);
	});

	it("cycle root is the alphabetically-first basename", () => {
		const { cycleRoots } = computeGraph(
			maps(["z.md", "a.md"], { "z.md": ["a.md"], "a.md": ["z.md"] }),
		);
		expect(cycleRoots[0]).toBe("a.md");
	});

	it("a cycle referenced by an external note is not a root", () => {
		const { rootNodes, cycleRoots } = computeGraph(
			maps(
				["ext.md", "a.md", "b.md"],
				{ "ext.md": ["a.md"], "a.md": ["b.md"], "b.md": ["a.md"] },
			),
		);
		expect(rootNodes).toEqual(["ext.md"]);
		expect(cycleRoots).toEqual([]);
	});
});
