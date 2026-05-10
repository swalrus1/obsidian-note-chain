/**
 * Shared helpers for building lightweight mock App objects used across test suites.
 */

export interface WriteRecord {
	path: string;
	content: string;
}

export interface MockFile {
	path: string;
	basename: string;
	stat: { ctime: number };
}

export interface MockCache {
	frontmatter?: Record<string, unknown>;
	/** Tags returned by the mocked getAllTags(). */
	_tags?: string[];
}

/** Construct a mock TFile-like object. */
export function mkFile(path: string, ctime = 0): MockFile {
	const name = path.split("/").pop() ?? path;
	return { path, basename: name.replace(/\.md$/, ""), stat: { ctime } };
}

/**
 * Build a minimal mock of obsidian's App.
 *
 * @param files   - All notes in the vault.
 * @param links   - Explicit wiki-links: source path → list of target paths.
 * @param caches  - Per-path metadata cache entries (frontmatter + tags).
 */
export function buildApp(opts: {
	files: MockFile[];
	links?: Record<string, string[]>;
	caches?: Record<string, MockCache>;
}): unknown {
	const resolvedLinks: Record<string, Record<string, number>> = {};
	for (const file of opts.files) {
		resolvedLinks[file.path] = {};
	}
	for (const [src, targets] of Object.entries(opts.links ?? {})) {
		for (const tgt of targets) {
			resolvedLinks[src] ??= {};
			resolvedLinks[src][tgt] = 1;
		}
	}

	return {
		vault: {
			getMarkdownFiles: () => opts.files,
			getAbstractFileByPath: (path: string) =>
				opts.files.find((f) => f.path === path) ?? null,
		},
		metadataCache: {
			resolvedLinks,
			getCache: (path: string) => opts.caches?.[path] ?? null,
		},
	};
}

/**
 * Like buildApp but also tracks vault.create / vault.modify calls and supports
 * dynamic file addition — needed for testing refreshIndex.
 */
export function buildMutableApp(opts: {
	files: MockFile[];
	caches?: Record<string, MockCache>;
}) {
	const files = [...opts.files];
	const caches: Record<string, MockCache> = { ...opts.caches };
	const created: WriteRecord[] = [];
	const modified: WriteRecord[] = [];

	return {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find(f => f.path === path) ?? null,
			create: async (path: string, content: string): Promise<MockFile> => {
				const name = path.split("/").pop() ?? path;
				const file: MockFile = { path, basename: name.replace(/\.md$/, ""), stat: { ctime: 0 } };
				files.push(file);
				created.push({ path, content });
				return file;
			},
			modify: async (file: MockFile, content: string): Promise<void> => {
				modified.push({ path: file.path, content });
			},
			created,
			modified,
		},
		metadataCache: {
			resolvedLinks: {} as Record<string, Record<string, number>>,
			getCache: (path: string) => caches[path] ?? null,
		},
	};
}
