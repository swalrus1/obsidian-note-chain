import { Editor, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { VIEW_TYPE_ROOT_NOTES, RootNotesView } from "./side-panel";
import { VIEW_TYPE_THREAD, ThreadView } from "./chain-view";
import { RootNotesSuggestModal } from "./chain-finder";
import { TitleStore } from "./title-store";
import { refreshIndex } from "./index-builder";

const LOG_PREFIX = "[note-chain]";

export default class RootNotesPlugin extends Plugin {
	private store = new TitleStore();

	async onload() {
		this.registerView(
			VIEW_TYPE_ROOT_NOTES,
			(leaf) => new RootNotesView(leaf, (file) => this.openThreadView(file))
		);

		this.registerView(
			VIEW_TYPE_THREAD,
			(leaf) => new ThreadView(leaf)
		);

		this.addRibbonIcon("git-fork", "Note Chain", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-note-chain",
			name: "Open Note Chain",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "link-chain",
			name: "Link chain",
			editorCallback: (editor: Editor) => {
				if (this.store.map.size === 0) {
					console.warn(LOG_PREFIX, "Title map is empty — no root notes to insert.");
					return;
				}
				new RootNotesSuggestModal(this.app, this.store.map, editor).open();
			},
		});

		this.addCommand({
			id: "create-successor",
			name: "Create successor",
			checkCallback: (checking: boolean) => {
				const currentFile = this.app.workspace.getActiveFile();
				if (!currentFile) return false;
				if (checking) return true;

				const link = `[[${currentFile.basename}]]`;
				const originalPath = currentFile.path;

				const handler = this.app.workspace.on("file-open", (file) => {
					if (!file || file.path === originalPath) return;
					this.app.workspace.offref(handler);
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view) return;
					view.editor.replaceSelection(link);
				});

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const executed = (this.app as any).commands.executeCommandById("zk-prefixer:new-zk-note");
				if (!executed) {
					this.app.workspace.offref(handler);
					const msg = "Could not execute 'Create new unique note' — is the Unique note creator core plugin enabled?";
					new Notice(msg);
					console.error(LOG_PREFIX, msg);
				}
			},
		});

		this.addCommand({
			id: "refresh-index",
			name: "Refresh index",
			callback: async () => {
				try {
					await refreshIndex(this.app);
				} catch (e) {
					console.error(LOG_PREFIX, "Refresh index failed:", e);
				}
			},
		});

		this.addCommand({
			id: "show-thread-view",
			name: "Show thread view",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) this.openThreadView(file);
				return true;
			},
		});

		// Rebuild index + refresh view when file metadata changes (links, frontmatter).
		// `resolved` fires once all pending files are done.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.store.rebuild(this.app);
				this.refreshRootNotesView();
			})
		);

		// Structural changes not covered by metadataCache events
		this.registerEvent(this.app.vault.on("delete", () => this.store.rebuild(this.app)));
		this.registerEvent(this.app.vault.on("rename", () => this.store.rebuild(this.app)));

		this.app.workspace.onLayoutReady(() => {
			this.store.rebuild(this.app);
			this.activateView();
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_ROOT_NOTES);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_THREAD);
	}

	async openThreadView(file: TFile) {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_THREAD,
			state: { path: file.path },
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async activateView() {
		const { workspace } = this.app;

		const leaves = workspace.getLeavesOfType(VIEW_TYPE_ROOT_NOTES);
		if (leaves.length > 0) {
			workspace.revealLeaf(leaves[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_ROOT_NOTES, active: true });
			workspace.revealLeaf(leaf);
		}
	}

	private refreshRootNotesView() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ROOT_NOTES)) {
			if (leaf.view instanceof RootNotesView) {
				leaf.view.render();
			}
		}
	}
}
