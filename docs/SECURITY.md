# Security model

This is an early implementation, not an audited public service. Report vulnerabilities privately to the repository owner's configured contact before public disclosure. A dedicated security contact must be configured before a public launch.

## Trust boundaries

The host can transmit any movie pixels/audio; approved guests can view and capture them. Browser security cannot prevent a permitted guest from recording. An invitation is a bearer secret, but admission remains manual. With no personal accounts, a kicked person can create a new browser identity and apply again if given another invitation; the host must approve it. Do not claim person-level identity bans.

HTTP/WebSocket use TLS in production; LiveKit uses WebRTC transport encryption. **No end-to-end encryption is claimed**: SFU operators are in the trust boundary. Never deploy recording/egress or packet-capture services in the default installation. Logging must not include session cookies, invite fragments, credentials, subtitles, chat contents, file paths, SDP or ICE payloads.

## Implemented controls

- Signed 7-day server-issued sessions, session-bound CSRF, strict same-origin mutation and WebSocket handshake checks; HttpOnly/SameSite cookies and production Secure.
- Server authority for approvals, playback, kicks, invitations, ending and transfer; no anonymous room listing.
- Room-scoped 2-minute LiveKit credentials with microphone-only grants for guests. Transport generation rotation on kicks, transfer, close and recovery.
- Signed LiveKit webhooks and periodic participant/source checks remove unauthorized or duplicate source tracks. Local SFU configuration bounds total tracks, signaling sizes, subscriptions and node bandwidth. Pending old-room retirement blocks issuing new credentials until cleanup succeeds.
- Bounded room membership, message history, request sizes, command deduplication, numeric validation and per-IP/session action budgets.
- No remote media fetcher, user HTML, file-upload endpoint, camera access, third-party analytics, public default TURN server or external identity provider.
- Plain-text SRT/VTT rendering into canvas, 1MB/10000-cue bounds; UTF-8/GB18030 support. Malformed input does not execute markup.
- Restrictive CSP, camera/geolocation Permissions-Policy, referrer suppression, frame protection, secret-free repository configuration and pinned dependencies.

## Operational requirements

Use HTTPS APP_ORIGIN and WSS LIVEKIT_URL; production refuses missing secrets/Redis/media readiness. Generate separate secrets per environment. Keep Redis and the LiveKit administrative port on a private network. Public signaling must go through the TLS reverse proxy. TURN needs valid certificates, ephemeral credentials, firewall rules and network testing; opening HTTPS alone does not prove connectivity.

The supplied development config advertises 127.0.0.1 and must **not** be published. Public deployment needs real advertised addresses and TURN/TLS configuration from LiveKit's current deployment guide. The control service runs a single replica. Behind a reverse proxy, the current IP limits conservatively count the proxy as one source; don't increase trust of arbitrary X-Forwarded-For values. Configure a restricted trusted proxy policy before a public multi-user deployment.

Room retirement is a coordinated operation, not immediate JWT revocation. Honest clients stop publishing to the old generation. Failed SFU room deletions retry; until infrastructure recovery, report the room as degraded. Public launch requires tests confirming old-generation credentials cannot receive newly published content and cannot exhaust server resources through empty-room recreation.

## Required pre-release checks

Run authorization/protocol tests, dependency audit and secret scan; exercise TURN-only networks and real Safari/iOS/Android devices. Adversarially validate maximum publisher/track counts at the SFU edge: webhook/periodic enforcement is reactive, rather than an atomic per-track admission hook. Confirm deployment-level connection/bitrate quotas before exposing an untrusted public service. Use container runtime resource limits, scan container images separately and review advisories on every release.

References: [OWASP WebSocket security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [LiveKit token grants](https://docs.livekit.io/frontends/reference/tokens-grants/), [LiveKit self hosting](https://docs.livekit.io/transport/self-hosting/).

## Experimental website synchronization

Official watch links use a strict four-provider HTTPS/path allowlist, normalized on the server with tracking/query secrets removed. There is no server-side URL fetch, redirect resolution, media proxy, account-token ingestion or iframe embedding. Source changes use the same host-only versioned authority as local files; pending users receive no source URL.

The optional MV3 extension asks for site permissions explicitly and pairs one room tab with one player tab in session storage. It receives only sanitized source/timing snapshots, rejects wrong-room and stale-generation updates, and stops controlled playback when snapshots expire or source/player changes. It does not read cookies, network responses or media URLs. Ads cannot be reliably identified; users must explicitly enable sync after reaching the feature and stop before ads or episode changes. Same-origin application scripts, the extension and allowed host DOM are trust boundaries. See WEBSITE_WATCH.md for unverified platform and installation cases.
