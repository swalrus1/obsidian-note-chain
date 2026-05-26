import { describe, it, expect } from "vitest";
import { chainNotes } from "../core/graph";

function mk(edges: [string, string][]): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	const ensure = (k: string) => {
		if (!out.has(k)) out.set(k, new Set());
	};
	for (const [a, b] of edges) {
		ensure(a);
		ensure(b);
		out.get(a)!.add(b);
	}
	return out;
}

describe("core/chainNotes", () => {
	it("includes the root note for an isolated node", () => {
		const out = mk([]);
		out.set("a.md", new Set());
		expect(chainNotes("a.md", out)).toEqual(["a.md"]);
	});

	it("includes all transitively reachable notes", () => {
		const out = mk([
			["a.md", "b.md"],
			["b.md", "c.md"],
		]);
		expect(chainNotes("a.md", out).sort()).toEqual(["a.md", "b.md", "c.md"]);
	});

	it("does not visit unrelated notes", () => {
		const out = mk([
			["a.md", "b.md"],
			["x.md", "y.md"],
		]);
		expect(chainNotes("a.md", out).sort()).toEqual(["a.md", "b.md"]);
	});

	it("handles a cycle without infinite-looping", () => {
		const out = mk([
			["a.md", "b.md"],
			["b.md", "a.md"],
		]);
		expect(chainNotes("a.md", out).sort()).toEqual(["a.md", "b.md"]);
	});
});
