# Getting started

Interlude supplies private watch-room software, not a movie catalogue. Friends joining a room need only a browser and a complete invitation link; they do not need GitHub, Render or LiveKit accounts.

## Join or host

Open the host's complete invitation including `#invite=...`, enter a nickname, wait for approval and click Start watching. There is no room code or public directory. Creating a new invitation invalidates the previous link.

To host, create a room, choose a local movie and wait for the file check. Copy an invitation for friends. New requests appear even when chat is collapsed or the player is fullscreen; click Review requests to approve them. Start screening and keep the host tab open. After refreshing, select the file again and confirm where to resume. Only the host controls the shared timeline; guests control their own volume. Microphones are off until enabled.

Use desktop Chrome or Edge for local-file hosting. Safari, Firefox and physical phones need more compatibility testing. MP4 H.264/AAC is a useful starting point; the file check determines whether a particular video can play. For official video websites, see the [experimental extension guide](WEBSITE_WATCH.md).

## Try locally

Install Git and Node.js 24+, then:

```sh
git clone https://github.com/askandtell/interlude.git
cd interlude
npm ci
node scripts/setup-dev.mjs
```

Run `npm run dev` and `npm run ui` in two terminals. Visit **http://127.0.0.1:15173** exactly. Local small-room P2P needs no cloud account. Without LiveKit there is no relay fallback; without Redis, development rooms disappear when the control process restarts. For local relay, use Docker with `npm run infra` or a native LiveKit server as described in [deployment](DEPLOYMENT.md).

Localhost links work only on your own computer. Do not share them with remote friends or expose development ports publicly.

## Deploy your own HTTPS address

1. Fork the repository and use your own hosting accounts. The public source contains no maintainer credentials or shared free credits.
2. Create a LiveKit Cloud project on an available free Build plan. Obtain its WSS URL and API key/secret.
3. In Render, create a Blueprint from your fork's `main` and root `render.yaml`.
4. Verify that both Web Service and Key Value are Free. Stop if asked to purchase resources or add a payment method.
5. Enter `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` as server-side environment variables. The Blueprint generates `SESSION_SECRET` and connects private `REDIS_URL` automatically. On Render, the app uses `RENDER_EXTERNAL_URL` as its exact HTTPS origin.
6. Deploy, then add `https://YOUR-SERVICE.onrender.com/api/livekit/webhook` to LiveKit Webhooks, selecting the same signing key used by the app.
7. Test real decoded picture and sound in two independent browser identities. Try direct mode and the host's relay control before inviting friends.

No purchased domain or VPS is required for this provider-subdomain route. Free availability and requirements depend on your provider account. Never put secrets in `VITE_*` variables, source, screenshots or issues. Build installs must include development tools (`npm ci --include=dev`); assets are built before pruning development dependencies.

Up to three approved online members prefer direct WebRTC. Four or more, or a failed direct connection, use LiveKit. Direct mode uploads one copy per viewer and may reveal public network addresses to approved peers. Relay uses your own account quota. Free hosting can sleep or pause when quotas are exhausted; this software does not promise unlimited free service.

For troubleshooting, see the [full guide](GETTING_STARTED.md), [hybrid transport behavior](HYBRID_MEDIA.md) and [free deployment limits](FREE_HOSTING.md). Report browser/OS versions, delivery mode and reproduction steps; never attach movie files, cookies, invitation tokens, media credentials or private conversations.
