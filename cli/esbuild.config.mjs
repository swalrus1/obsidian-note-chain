import esbuild from "esbuild";
import builtins from "builtin-modules";

const banner = "#!/usr/bin/env node\n";

await esbuild.build({
	banner: { js: banner },
	entryPoints: ["cli/src/cli.ts"],
	bundle: true,
	platform: "node",
	external: builtins,
	format: "cjs",
	target: "node18",
	logLevel: "info",
	outfile: "cli/dist/cli.js",
	sourcemap: false,
	minify: false,
});
