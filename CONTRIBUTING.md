# Contributing

Interlude is a focused WatchParty derivative for private local-file screenings. Preserve upstream attribution and history. Keep features small enough to review and test; do not add a public room directory, arbitrary media-fetch proxy, analytics, recording or credential-bearing client URLs.

Use Node.js 24+, `npm ci`, then `node scripts/setup-dev.mjs`. Existing local secrets are preserved. Start the configured media service, `npm run dev` and `npm run ui`. Use the exact configured app origin; do not mix localhost and 127.0.0.1.

Before a change is ready for review:

1. Run `npm run format:check` and `npm run check`. The upstream conversion implementation is excluded from formatting to preserve its source form.
2. Run the relevant browser tests. Media cases require `npm run test:media`, a real LiveKit server and `MEDIA_E2E=1`. Set `REDIS_TEST_URL` for actual Redis tests. Skipped tests are not passing evidence.
3. Review screenshots at desktop, tablet and mobile widths. Check failure states, keyboard access and reduced motion, not only the happy path.
4. Update the test report with actual results. Keep same-machine tests, real-device tests and public-network results separate.
5. Regenerate `docs/DEPENDENCIES.json` with `node scripts/licenses.mjs` after dependency changes. Audit packages, preserve licenses, and keep local secrets/fixtures/artifacts out of Git.

Repeated full browser suites can exhaust the development process's per-IP creation budget. Start a fresh isolated development control process between suites; do not weaken product limits to make tests pass. Never restart another contributor's service or remove unrelated Redis keys.

The UI is implemented with React/CSS, not image mockups. Product screens must not load the generated design boards or archived decorative images. Keep format claims based on real preflight results and all displayed connection states based on actual transport/render state.

See `docs/SECURITY.md` for trust boundaries and pre-release checks. Report vulnerabilities privately to the repository owner's configured contact; public launch requires a dedicated security contact. GitHub publication and public deployments require separate authorization.
