# Attribution and sources

一起看 is derived from **WatchParty**, copyright (c) 2020 Howard Chung, under the MIT license. The original LICENSE, attribution and Git history are retained. See [WatchParty](https://github.com/howardchung/watchparty) and the [source version used](https://github.com/howardchung/watchparty/tree/2d366c1006b7b86228bcd7bb6debc111d857f51e).

`src/media/ClientTranscoder.ts` retains WatchParty's local WebCodecs/Mediabunny conversion implementation, relocated from `src/utils/clientTranscode.ts`. Room/security/UI code is rewritten for private rooms. Upstream cloud services, billing, virtual browsing, external default TURN endpoints, magnet links and Firebase configuration are removed from the current working tree; they remain visible only in historical upstream commits.

Runtime components include React (MIT), Mantine (MIT), Socket.IO (MIT), Express (MIT), Redis client ioredis (MIT), Zod (MIT), Mediabunny (MPL-2.0) and its AC-3 package (see its installed license), Tabler icons (MIT), and Helmet (MIT). Consult the exact installed package LICENSE files and lockfile before redistribution; this summary is not a substitute for third-party notices or patent review. FFmpeg is used only by optional test-fixture scripts and is not bundled into the application.

Runtime package metadata is listed in `docs/DEPENDENCIES.json`; regenerate it with `node scripts/licenses.mjs` after dependency changes.

Redis is a separately deployed service, not application source. The provided Redis 7.4.2 container is under Redis's source-available RSALv2/SSPLv1 choices, not the BSD license of the Redis 7.0.15 used in native local testing. Review the exact server-image license when choosing a deployment; do not label every dependency as MIT. No Redis server binaries are included in this repository.

Syncplay (Apache-2.0) and OpenTogetherTube (AGPL-3.0) were research references; their source is not incorporated. Interface icons use Tabler. Screenshots in `docs/design/` show the running application.

## Optional website-sync extension

The original MV3 companion under extensions/watch-sync adds no third-party runtime libraries or platform source code. Platform names identify compatible link formats only and imply no endorsement. Website media, account rights and subscriptions remain with each platform; no extraction or DRM bypass is provided.
