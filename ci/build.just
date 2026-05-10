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

# Bump version, commit, tag, and push to trigger the release workflow
release version:
    node -e "const fs=require('fs'); ['manifest.json','package.json'].forEach(f => { const j=JSON.parse(fs.readFileSync(f)); j.version='{{version}}'; fs.writeFileSync(f, JSON.stringify(j, null, '\t')+'\n'); })"
    git add manifest.json package.json
    git commit -m "chore: release {{version}}"
    git tag {{version}}
    git push origin HEAD {{version}}
