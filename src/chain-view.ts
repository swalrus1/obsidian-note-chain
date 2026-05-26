import { ItemView, MarkdownRenderer, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { buildLinkMaps, basename } from "./graph";

const LOG_PREFIX = "[note-chain]";

// Paragraphs consisting only of wikilink lines (e.g. successor references) add
// no readable content to the thread — strip them before rendering.
const WIKILINK_ONLY_PARA = /(\[\[[^\]]*\]\]\n)+\n?/g;

function preprocessContent(content: string): string {
	return content.replace(WIKILINK_ONLY_PARA, "");
}

export const VIEW_TYPE_THREAD = "thread-view";

/**
 * Read-only view that renders all notes in a chain as a scrollable thread,
 * sorted by creation time descending (newest first).
 */
export class ThreadView extends ItemView {
	private rootPath: string | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_THREAD; }
	getDisplayText(): string {
		return this.rootPath ? `Thread: ${basename(this.rootPath)}` : "Thread";
	}
	getIcon(): string { return "list-tree"; }

	async setState(state: { path?: string }, result: ViewStateResult): Promise<void> {
		if (state.path) {
			this.rootPath = state.path;
			await this.render();
		}
		return super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { path: this.rootPath };
	}

	async onOpen() {
		if (this.rootPath) await this.render();
	}

	async onClose() {}

	private async render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		if (!this.rootPath) {
			container.createEl("p", { text: "No note selected.", cls: "root-notes-empty" });
			return;
		}

		const { outLinks } = buildLinkMaps(this.app);

		// BFS to collect all notes in the chain
		const chain = new Set<string>([this.rootPath]);
		const queue = [this.rootPath];
		while (queue.length > 0) {
			const note = queue.shift()!;
			for (const referenced of outLinks.get(note) ?? []) {
				if (!chain.has(referenced)) {
					chain.add(referenced);
					queue.push(referenced);
				}
			}
		}

		// Resolve paths to TFiles and sort by creation time descending (newest first)
		const files: TFile[] = [];
		for (const path of chain) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				files.push(file);
			} else {
				console.warn(LOG_PREFIX, `Thread view: expected a TFile at path "${path}" but got none.`);
			}
		}
		files.sort((a, b) => b.stat.ctime - a.stat.ctime);

		// Render each note's content
		for (const file of files) {
			const section = container.createEl("div", { cls: "thread-section" });
			const heading = section.createEl("h2", { cls: "thread-note-title" });
			const titleLink = heading.createEl("a", { text: file.basename, cls: "thread-note-title-link" });
			titleLink.addEventListener("click", (e) => {
				e.preventDefault();
				this.app.workspace.getLeaf(false).openFile(file);
			});

			let content: string;
			try {
				content = await this.app.vault.read(file);
			} catch (e) {
				console.error(LOG_PREFIX, `Thread view: failed to read file "${file.path}":`, e);
				section.createEl("p", { text: "Error reading note content.", cls: "root-notes-empty" });
				continue;
			}

			const body = section.createEl("div", { cls: "thread-note-body" });
			try {
				await MarkdownRenderer.render(this.app, preprocessContent(content), body, file.path, this);
			} catch (e) {
				console.error(LOG_PREFIX, `Thread view: failed to render "${file.path}":`, e);
				body.setText(content);
			}
		}
	}
}
