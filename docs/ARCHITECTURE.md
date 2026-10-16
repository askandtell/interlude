# Architecture

React, Mantine and Vite provide the interface. Express and Socket.IO manage authenticated rooms. Redis stores short-lived room data. Video decoding, compatibility conversion and subtitles run on each viewer's device.

The control service receives no movie or microphone bytes. Local files are never distributed. Website mode sends a canonical official watch URL and timeline to an explicitly paired browser extension.

## Authority

Protocol version 2 uses private invitations, host approval, signed sessions, same-origin CSRF checks and host-only timeline commands. Commands carry an ID, state revision and source epoch. A per-room queue serializes changes within one process. Membership reports can update only the caller's readiness or playback state.

Sources are explicitly local, website or empty. Switching sources pauses the timeline, advances the source epoch and resets readiness. Pending members receive no source or chat. Kicks revoke the session's membership; clients stop local playback and discard their room state.

## Client playback

Each local source has its own file handle, decoder and subtitle settings. Candidate preparation is cancellable; failed candidates preserve the previous source. After source acceptance the old source is disposed. The same implementation serves hosts and guests; only the host can select the room source.

Clock probes estimate server offset from round-trip midpoints. Playback targets use server time; small drift is left alone, moderate drift uses brief rate correction, and errors above 500ms seek. Explicit pause/seek commands apply immediately. Buffering affects only that device. Reconnection pauses until the viewer opts in again.

Refresh does not restore file permissions. Tab-local metadata can suggest a host resume point after file reselection and confirmation. Metadata is not a content identity check.

Room lifetime is 24 hours, invitations two hours, empty-room timeout 30 minutes and absent-host timeout ten minutes. The room holds up to eight approved members and sixteen pending requests. Version-1 rooms close during migration; other Redis namespaces are untouched.
