# Getting started

Create a room, choose a local video and share a complete invitation. Approve friends when they request entry. Each friend must choose their own copy of the same cut, confirm it and click Join. The host controls the shared timeline; everyone controls personal volume and subtitles.

Files differing by more than one second in duration cannot join. Matching duration does not establish matching content. Files are never distributed by 一起看. Refreshing requires reselection; reconnection pauses local playback until the viewer resumes.

For website mode, each person watches on the official site with their own account. The optional desktop extension coordinates playback; the four-provider adapters remain experimental. See [website setup](WEBSITE_WATCH.md).

For development, install Git and Node.js 24+, clone the repository, run `npm ci` and `node scripts/setup-dev.mjs`, then run `npm run dev` and `npm run ui` in separate terminals. Open http://127.0.0.1:15173 . Local links cannot be shared with remote friends.

[Hosting](FREE_HOSTING.md) requires only website and room storage resources. No media account, voice service or video quota is needed. Ordinary viewers just open the website. Free hosting still has capacity and availability limits.
