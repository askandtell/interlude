import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const packages = Object.entries(lock.packages)
  .filter(([path, p]) => path && !p.dev)
  .map(([path, p]) => {
    const metadataPath = `${path}/package.json`;
    const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) : {};
    return {
      name: metadata.name || path.split('node_modules/').at(-1),
      version: p.version,
      license:
        metadata.license ||
        metadata.licenses?.map((item) => item.type).join(' OR ') ||
        p.license ||
        'REVIEW REQUIRED',
      source: metadata.repository?.url || metadata.repository || p.resolved,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  'docs/DEPENDENCIES.json',
  JSON.stringify(
    {
      note: 'Runtime package metadata inventory; consult original licenses. Redis server is deployed separately; see THIRD_PARTY_NOTICES.md.',
      packages,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Saved ${packages.length} runtime package entries to docs/DEPENDENCIES.json`);
