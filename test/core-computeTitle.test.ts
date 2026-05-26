import { describe, it, expect } from "vitest";
import { computeTitle } from "../core/title";

function makeOutLinks(edges: [string, string][]): Map<string, Set<string>> {
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

describe("core/computeTitle", () => {
	it("returns null when no note in the chain has a chain property", () => {
		const out = makeOutLinks([["a.md", "b.md"]]);
		expect(computeTitle("a.md", out, () => null)).toBeNull();
	});

	it("returns the single surviving candidate's chain value", () => {
		const out = makeOutLinks([]);
		out.set("a.md", new Set());
		const fm = (p: string) => (p === "a.md" ? { chain: "my-project" } : null);
		expect(computeTitle("a.md", out, fm)).toBe("my-project");
	});

	it("eliminates a downstream candidate that another candidate reaches directly", () => {
		const out = makeOutLinks([["a.md", "b.md"]]);
		const fm = (p: string) =>
			p === "a.md" ? { chain: "root-title" } :
			p === "b.md" ? { chain: "child-title" } :
			null;
		expect(computeTitle("a.md", out, fm)).toBe("root-title");
	});

	it("eliminates a candidate reachable transitively", () => {
		const out = makeOutLinks([["a.md", "b.md"], ["b.md", "c.md"]]);
		const fm = (p: string) =>
			p === "a.md" ? { chain: "top" } :
			p === "b.md" ? { chain: "mid" } :
			p === "c.md" ? { chain: "bot" } :
			null;
		expect(computeTitle("a.md", out, fm)).toBe("top");
	});

	it("reports a collision when two candidates do not reach each other", () => {
		const out = makeOutLinks([
			["root.md", "a.md"],
			["root.md", "b.md"],
		]);
		const fm = (p: string) =>
			p === "a.md" ? { chain: "alpha" } :
			p === "b.md" ? { chain: "beta" } :
			null;
		expect(computeTitle("root.md", out, fm)).toBe("chain collision: [alpha, beta]");
	});
});
