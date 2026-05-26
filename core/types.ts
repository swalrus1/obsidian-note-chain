export interface LinkMaps {
	outLinks: Map<string, Set<string>>;
	inLinks: Map<string, Set<string>>;
}

export interface GraphData extends LinkMaps {
	rootNodes: string[];
	cycleRoots: string[];
}

export type ResolvedLinks = Record<string, Record<string, number>>;

export type FrontmatterReader = (path: string) => Record<string, unknown> | null;
