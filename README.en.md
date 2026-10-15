# Interlude / 幕间

A private, browser-first cinema for 2–8 friends. Choose a local film, invite your friends, approve their seats, and watch together with text and opt-in voice chat. Local files are never uploaded for permanent storage. Up to three online members use direct WebRTC first; failed direct connections or four or more members use LiveKit. Migration preserves the file, briefly pauses playback and closes the microphone. See [hybrid media behavior and privacy](docs/HYBRID_MEDIA.md). Cloud fallback still depends on available quota; free, unlimited service is not promised.

![Interlude actual browser interface](docs/design/implemented-home.png)

![Interlude actual screening room](docs/design/implemented-room.png)

## Interface and basic experience

The functional light lobby contains create, invitation and local recent-room actions; the dark screening room has one coherent player and a collapsible chat panel. Decorative artwork and Three.js/GSAP have been removed. Failed or cancelled replacement files preserve the previous movie. After a refresh, the host must reselect a matching local file and explicitly confirm resuming.

SRT/VTT subtitles support shared size, offset and wrapping; host preview uses the actual composited canvas. Microphone tests are opt-in, local-only and release their tracks when closed. Device selection follows browser capabilities.

## Run locally

Node.js 24+, npm and LiveKit Server (native or Docker) are required.

```sh
npm ci
node scripts/setup-dev.mjs
npm run infra
# Terminal 1
npm run dev
# Terminal 2
npm run ui
```

Visit http://127.0.0.1:15173. For a native LiveKit install use `livekit-server --config deploy/livekit.local.yaml`. Redis is optional in development; configure REDIS_URL for TTL-backed room metadata. The Compose Redis is private to the stack. Full-container mode: `docker compose up --build`, then http://localhost:18080.

The host needs desktop Chrome/Edge and must keep the tab/file available. Guests receive a live stream, not a locally seekable file. Mic access is requested only after an explicit click. No camera, billing, remote browser, generic media proxy or public room listing is enabled.

Every invite-copy action rotates the invite; previous links expire. No account is needed, but membership requires owner approval. Transport encryption is provided; E2EE is not claimed.

## Verification and limits

`npm run check`; `npm run test:e2e`; `npm run test:media` generates FFmpeg fixtures. Set MEDIA_E2E=1 for actual SFU tests. See [verification status](docs/TEST_REPORT.md), [security model](docs/SECURITY.md) and [deployment guide](docs/DEPLOYMENT.md).

This is an early local implementation. Public internet/TURN-only operation, real iOS/Safari/Android devices, two-hour soak and measured inter-viewer synchronization targets are separate release gates. Jellyfin and native apps are future work.

## Attribution

Derived from Howard Chung's [WatchParty](https://github.com/howardchung/watchparty), MIT licensed. Full upstream history and license retained; baseline commit `2d366c1006b7b86228bcd7bb6debc111d857f51e`. The local transcoder is reused; private-room authority, SFU integration and UI are purpose-built. See [third-party notices](THIRD_PARTY_NOTICES.md). No GitHub repository or public hosting is created automatically.

## Official-site watch sync (experimental)

Rooms accept canonical Bilibili, Youku, iQiyi and Tencent Video watch-page links. Each viewer plays on the official site with their own access rights. Interlude shares only the link and authoritative timeline, with manual alignment or the unpacked Chrome/Edge extension in `extensions/watch-sync`. It does not download, proxy, decrypt or capture site media, share accounts, or bypass ads/paywalls. Real account, ad and subscription playback on all four sites and the full extension installation flow remain unverified. See [setup and limitations](docs/WEBSITE_WATCH.md). No additional dependencies were added.

## Free hosted hobby deployment

`render.yaml` defines a Free Node web service and private Free Key Value instance, with LiveKit Cloud Build for media. The platform-provided HTTPS hostname is used as the exact Origin; no custom domain or rented VPS is required. Credentials stay in server-side secret variables. Free services can sleep, restart, or exhaust quotas; mainland reachability and real media require testing. See [deployment details](docs/FREE_HOSTING.md).
