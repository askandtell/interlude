# Development and deployment

Node.js 24+ is required. Run `npm ci` and `node scripts/setup-dev.mjs`, then start `npm run dev` and `npm run ui`. The local origin is http://127.0.0.1:15173 . Without Redis, development rooms disappear when the process restarts.

`docker compose up --build` starts the application and private Redis. Open http://localhost:18080 . The default loopback stack uses development HTTP; public deployment requires HTTPS.

Production requires `NODE_ENV=production`, an exact HTTPS `APP_ORIGIN` (or Render's external URL), a random `SESSION_SECRET` of at least 32 characters, and private `REDIS_URL`. Use a TLS reverse proxy and a single control replica. No media server, UDP ports or media credentials are needed. See [Render hosting](FREE_HOSTING.md).

The process uses per-room in-process serialization. Do not add replicas without distributed coordination. Redis stores expiring room data, not video files. The Compose Redis has no disk persistence; restarts lose rooms. Room cleanup is limited to the application's own namespace.

Build with `npm ci --include=dev`, `npm run build`, then `npm prune --omit=dev`. Check /api/health and actual two-browser synchronization after deployment. Health indicates storage availability, not successful playback on every device.
