import { describe, it, expect } from "vitest";
import { preprocessContent } from "../src/chain-view";

describe("preprocessContent", () => {
	it("removes a mid-file wikilink-only paragraph", () => {
		const input = "Some text.\n\n[[Note A]]\n[[Note B]]\n\nMore text.\n";
		const output = preprocessContent(input);
		expect(output).toBe("Some text.\n\nMore text.\n");
	});

	it("removes a wikilink-only last line with trailing newline", () => {
		const input = "Some text.\n\n[[Note A]]\n";
		expect(preprocessContent(input)).toBe("Some text.\n\n");
	});

	it("removes a wikilink-only last line without trailing newline", () => {
		const input = "Some text.\n\n[[Note A]]";
		expect(preprocessContent(input)).toBe("Some text.\n\n");
	});

	it("does not remove a line with text alongside a wikilink", () => {
		const input = "See [[Note A]] for details.\n";
		expect(preprocessContent(input)).toBe("See [[Note A]] for details.\n");
	});

	it("preserves content when there are no wikilink-only paragraphs", () => {
		const input = "Just plain text.\n";
		expect(preprocessContent(input)).toBe("Just plain text.\n");
	});

	it("removes a single wikilink that is the entire content", () => {
		expect(preprocessContent("[[Note A]]")).toBe("");
	});

	it("handles wikilinks with aliases", () => {
		const input = "Text.\n\n[[Note A|My alias]]\n";
		expect(preprocessContent(input)).toBe("Text.\n\n");
	});
});
