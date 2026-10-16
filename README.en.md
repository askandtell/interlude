# 一起看 / Watch Together

Play your own copy. Watch together.

[Open 一起看](https://interlude-eoqk.onrender.com) · [Guide](docs/GETTING_STARTED.en.md) · [中文](README.md)

![Room](docs/design/implemented-room.png)

Private rooms for up to eight people, invitations, host approval and text chat. Each person opens their own local video; 一起看 synchronizes playback, pause and seek. Subtitles and volume are personal. Files and subtitle contents stay on each device.

Website mode coordinates official watch pages using an optional desktop extension. Each viewer needs their own access rights. Four providers have link and standard-player adapters; real-site compatibility is still experimental.

一起看 does not distribute the host's file, relay video, provide voice calls or require media-service credentials. Public hosting still needs computing resources and may sleep or hit limits.

## Development

Install Node.js 24+, run `npm ci` and `node scripts/setup-dev.mjs`. Start `npm run dev` and `npm run ui` in separate terminals; open http://127.0.0.1:15173 . Redis is required in production; local development can use the temporary memory store.

Run `npm run check`. With FFmpeg installed, generate fixtures using `npm run test:media`, install Chromium using `npx playwright install chromium`, then run `npm run test:e2e`.

[Deployment](docs/DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md) · [Tests](docs/TEST_REPORT.md) · [Security](docs/SECURITY.md)

Physical phones, separate networks, long sessions and full official-site login/ad compatibility need further testing. Local copies must use the same cut; a duration match is not proof of identical content. Refreshing requires file reselection, and reconnecting requires an explicit resume.

Derived from [WatchParty](https://github.com/howardchung/watchparty), retaining its MIT license, attribution and history, including the browser conversion module. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
