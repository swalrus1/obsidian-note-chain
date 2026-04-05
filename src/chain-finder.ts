import { App, Editor, FuzzySuggestModal, TFile } from "obsidian";

const LOG_PREFIX = "[root-notes-view]";

export interface TitleEntry {
	title: string;
	path: string;
}

/**
 * Fuzzy-search modal that lets the user pick a root note and inserts a
 * wiki-link at the current editor cursor.
 */
export class RootNotesSuggestModal extends FuzzySuggestModal<TitleEntry> {
	private items: TitleEntry[];

	constructor(app: App, titleMap: Map<string, string>, private editor: Editor) {
		super(app);
		this.setPlaceholder("Search root notes…");
		this.items = Array.from(titleMap.entries()).map(([title, path]) => ({ title, path }));
	}

	getItems(): TitleEntry[] {
		return this.items;
	}

	getItemText(item: TitleEntry): string {
		return item.title;
	}

	onChooseItem(item: TitleEntry): void {
		const file = this.app.vault.getAbstractFileByPath(item.path);
		if (!(file instanceof TFile)) {
			console.error(LOG_PREFIX, `Cannot resolve file for path "${item.path}" during insertion.`);
			return;
		}
		this.editor.replaceSelection(`[[${file.basename}]]`);
	}
}
