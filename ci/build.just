import? 'config.just'

plugin_id := "note-chain"

# Build the plugin and install it into the Obsidian vault
update vault:
    just build
    just install {{vault}}

# Compile TypeScript to main.js
build:
    npm run build

# Copy built artefacts to the Obsidian plugins directory
install vault:
    cp main.js manifest.json styles.css '{{vault}}/.obsidian/plugins/{{plugin_id}}/'
    @echo "Installed to {{vault}}/.obsidian/plugins/{{plugin_id}}/"
    @echo "Re-enable the plugin in Obsidian (Settings → Community plugins) if needed."

# Install npm dependencies
deps:
    npm install

# Run unit tests
test:
    npm test

# Watch mode for development
dev:
    npm run dev

# Bump patch version, commit, tag, and push to trigger the release workflow
release:
    #!/usr/bin/env node
    const fs = require('fs');
    const cur = JSON.parse(fs.readFileSync('manifest.json')).version;
    const parts = cur.split('.').map(Number);
    parts[2]++;
    const next = parts.join('.');
    for (const f of ['manifest.json', 'package.json']) {
        const j = JSON.parse(fs.readFileSync(f));
        j.version = next;
        fs.writeFileSync(f, JSON.stringify(j, null, '\t') + '\n');
    }
    const {execSync} = require('child_process');
    execSync(`git add manifest.json package.json`);
    execSync(`git commit -m "chore: release ${next}"`);
    execSync(`git tag ${next}`);
    execSync(`git push origin HEAD ${next}`, {stdio: 'inherit'});
