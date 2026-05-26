import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import type { ResolvedLinks } from "../../core/types";

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

export interface VaultData {
	vaultDir: string;
	files: string[];
	resolvedLinks: ResolvedLinks;
	frontmatter: Map<string, Record<string, unknown>>;
	ctimes: Map<string, number>;
}

export function loadVault(vaultDir: string): VaultData {
	const abs = path.resolve(vaultDir);
	if (!fs.existsSync(abs)) {
		throw new Error(`Vault directory does not exist: ${abs}`);
	}
	if (!fs.statSync(abs).isDirectory()) {
		throw new Error(`Vault path is not a directory: ${abs}`);
	}

	const files: string[] = [];
	walk(abs, abs, files);
	files.sort();

	const byBasename = new Map<string, string[]>();
	for (const rel of files) {
		const base = basename(rel);
		if (!byBasename.has(base)) byBasename.set(base, []);
		byBasename.get(base)!.push(rel);
	}

	const resolvedLinks: ResolvedLinks = {};
	const frontmatter = new Map<string, Record<string, unknown>>();
	const ctimes = new Map<string, number>();

	for (const rel of files) {
		const full = path.join(abs, rel);
		const stat = fs.statSync(full);
		ctimes.set(rel, stat.birthtimeMs || stat.mtimeMs);

		const content = fs.readFileSync(full, "utf8");
		const { frontmatter: fm, body } = splitFrontmatter(content);
		if (fm) frontmatter.set(rel, fm);

		const targets: Record<string, number> = {};
		for (const linkText of extractWikilinks(body)) {
			const target = resolveLink(linkText, files, byBasename);
			if (target && target !== rel) targets[target] = 1;
		}
		resolvedLinks[rel] = targets;
	}

	return { vaultDir: abs, files, resolvedLinks, frontmatter, ctimes };
}

function walk(root: string, dir: string, out: string[]): void {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(root, full, out);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			out.push(path.relative(root, full).split(path.sep).join("/"));
		}
	}
}

function basename(p: string): string {
	return p.split("/").pop()!.replace(/\.md$/, "");
}

function splitFrontmatter(
	content: string,
): { frontmatter: Record<string, unknown> | null; body: string } {
	if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
		return { frontmatter: null, body: content };
	}
	const startLen = content.startsWith("---\r\n") ? 5 : 4;
	const rest = content.slice(startLen);
	const endIdx = rest.search(/\n---(\r?\n|$)/);
	if (endIdx < 0) return { frontmatter: null, body: content };
	const fmText = rest.slice(0, endIdx);
	const afterEnd = rest.indexOf("\n", endIdx + 1);
	const body = afterEnd < 0 ? "" : rest.slice(afterEnd + 1);
	try {
		const parsed = yaml.load(fmText);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { frontmatter: parsed as Record<string, unknown>, body };
		}
	} catch {
		// malformed YAML — treat as no frontmatter
	}
	return { frontmatter: null, body };
}

function extractWikilinks(body: string): string[] {
	const out: string[] = [];
	for (const m of body.matchAll(WIKILINK_RE)) {
		let s = m[1];
		const pipe = s.indexOf("|");
		if (pipe >= 0) s = s.slice(0, pipe);
		const hash = s.indexOf("#");
		if (hash >= 0) s = s.slice(0, hash);
		s = s.trim();
		if (s) out.push(s);
	}
	return out;
}

function resolveLink(
	linkText: string,
	allFiles: string[],
	byBasename: Map<string, string[]>,
): string | null {
	if (linkText.includes("/")) {
		const candidate = linkText.endsWith(".md") ? linkText : `${linkText}.md`;
		if (allFiles.includes(candidate)) return candidate;
	}
	const base = linkText.replace(/\.md$/, "");
	const matches = byBasename.get(base) ?? [];
	if (matches.length === 1) return matches[0];
	return null;
}
