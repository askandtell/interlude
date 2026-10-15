# 幕间 / Interlude architecture

The application is a focused derivative of WatchParty, not an upstream-compatible replacement. WatchParty's full history and MIT license are retained. The browser transcoding implementation is retained in `src/media/ClientTranscoder.ts`. Its original streaming design informed the local media pipeline. The original monolithic room implementation is replaced because private admission, authenticated sessions, epochs and least-privilege SFU tokens require a different authority model. React, Vite, Mantine, Socket.IO, Mediabunny and LiveKit provide the reusable foundations; codecs, transport protocols and UI primitives are not reimplemented.

## Flow

1. Same-origin `/api/session` issues an HttpOnly, SameSite=Strict session cookie and a session-bound CSRF nonce. Production uses Secure cookies.
2. Creating a room returns a high-entropy invite once. Only its SHA-256 digest is stored. Sharing uses `/room/:id#invite=...`; the fragment is never an HTTP request parameter and is stripped after joining.
3. Joining creates a pending member. Pending snapshots exclude the movie, chat and member list. Only the owner can approve up to 8 total members.
4. `MediaSourceAdapter` probes the actual local container/tracks using Mediabunny, then opens the file locally. The original WatchParty transcoder is opt-in. Input is never uploaded as a file.
5. Local decoded frames and sanitized subtitles are composited onto a canvas; the host previews this exact canvas. The canvas video and captured film audio are published as separate screen-share tracks. Microphones are independent, opt-in tracks. Local microphone tests never acquire SFU credentials.
6. LiveKit forwards the real-time streams. No egress/recording service is deployed. The control service never receives video or microphone bytes.

## Authority and ordering

- Each browser session gets a separate opaque membership ID; client-supplied roles are never trusted.
- A per-room promise queue serializes mutations within **one control process**. Redis is the durable TTL-backed store, not a distributed-lock implementation. Run one replica; horizontal scaling needs a distributed room coordinator before increasing replicas.
- Control commands include UUID, media epoch and state revision. Duplicate accepted commands are idempotent; stale commands fail with `STALE_STATE`. Metadata from an older source cannot control a newer file.
- Live streams are not seekable files on viewers. Only the host's source seeks. Guest positions shown in UI are estimates from the authoritative timeline, not measurements of rendered video latency.
- Hosts must retain the file and keep the tab alive. Reloading requires reselection. Transfer of management never transfers local bytes.
- File replacement is staged: pause the existing source, prepare a candidate, commit its source command, then replace resources. Stale/cancelled candidates cannot commit. Tab-local file metadata offers an explicit paused resume after reselection, not automatic file access or content-identity proof.
- Room/control, local-film, playback-connection and device-test hooks separate state ownership. A connected control socket or SFU signal alone does not mean a movie frame has rendered. Brief control interruptions preserve usable media tracks while pausing the host; security generation changes still tear down the old transport.

## Room and media lifetimes

Hard room TTL: 24h. Invite lifetime: 2h. Pending seats: 16. Membership records: at most 64 including denied/banned sessions. Chat ring: 100 messages, 1000 characters per message. Empty rooms expire after 30min; an absent owner after 10min. Heartbeats every 15s, stale presence after 45s. Restart invalidates media availability and rotates transport rooms, requiring an explicit restart of playback.

Kicking a member bans that session, rotates the invitation and media room generation, disconnects current clients and queues deletion of the former SFU room. Clients must reconnect explicitly; the host republishes into the new generation. Failed server deletions are retained for retry. Never rely on removing a self-hosted LiveKit participant to invalidate their JWT.

## Future Jellyfin integration

Implement a separate `MediaSourceAdapter`; preserve room/transport interfaces. Use Jellyfin's official SDK. Each user or explicitly configured shared service identity must be authorized; no owner's long-lived token in room snapshots, chat, URLs or logs. Server origins must be explicitly configured; introducing a generic URL proxy is out of scope. Jellyfin is **not implemented in v0.1**.

## Website source

`PlaybackState.website` optionally identifies a canonical official watch page; the `website` command rotates mediaEpoch and starts a paused authority timeline. Local `source` replaces and removes that field. No new HTTP endpoint or remote media fetch is introduced. The React website panel retains the local player DOM for transactional replacement and voice transport, without sending website movie tracks to LiveKit. `useWebsiteBridge` answers same-window requests with URL/timing only for connected approved members.

The optional `extensions/watch-sync` MV3 worker pairs tabs, serializes messages and holds ephemeral snapshots; activeTab injects the room bridge, and explicitly granted per-site permissions inject the standard-video adapter. The adapter applies room operations; site interactions do not send playback commands back into the room. This is a distinct, experimental control-only synchronization mode and has not inherited local-stream latency measurements.
