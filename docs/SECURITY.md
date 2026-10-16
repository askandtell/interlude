# Security

一起看 synchronizes independently played media. The server never receives video files, subtitles, microphone tracks or website account credentials. No media-relay service is configured.

## Access controls

Sessions are server-issued, signed and carried in HttpOnly/SameSite cookies; production requires Secure cookies and HTTPS. Writes require same-origin CSRF validation, and WebSocket handshakes check origin, session and protocol version. The server controls roles; callers cannot nominate another member when reporting readiness.

Invitations are high-entropy bearer secrets stored as digests, expire after two hours and require host approval. Pending members see no source, member list or chat history. Kicking revokes membership and rotates the invite. A new browser identity may apply again only with a valid invite and renewed approval.

Commands use IDs, revisions and source epochs. Inputs, message sizes, membership counts, chat history and event rates are bounded. Subtitles are treated as bounded plain text. File names and paths stay local; room titles are separate from file metadata.

CSP limits connections to the application origin. Camera, microphone and geolocation permissions are disabled. Redis stays private. Logs must not contain cookies, invitations, chat, credentials or file paths. HTTPS provides transport encryption; application-level end-to-end encryption is not claimed.

## Extension

The MV3 extension uses optional permissions for four exact official domains and temporary access to a user-selected room tab. It does not read cookies, intercept media requests, download content or bypass access controls. Pairing expires with the browser session. Stale room state, changed source or player replacement pauses controlled playback until explicit confirmation.

## Release checks

Run authorization tests, dependency audit and `npm run security:secrets`. The latter checks tracked private configuration, common credential formats, frontend secret references and copies of local credentials in published files/builds; it prints rule and file names only. Full Git history also needs a dedicated scanner such as Gitleaks with redacted output.

Historical upstream commits contain old client configuration and test-key alerts; these are not used by the current application. If a real deployment secret is exposed, revoke it first: deleting a file cannot undo disclosure. Keep private reports and raw test traces out of public issues. Contact the maintainer privately for sensitive findings.

The current service is a single replica. Shared hosting and proxy-level resource limits still need operational attention; removing video traffic does not provide infinite capacity.
