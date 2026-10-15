# Development and deployment

## Local browser development

Node.js 24+, npm, and either LiveKit Server or Docker are required. Redis is recommended; without REDIS_URL the **development-only** in-memory store loses rooms at restart. There is no fake media transport: without LiveKit, the UI explicitly reports that movie and voice publishing are unavailable.

```sh
npm ci
node scripts/setup-dev.mjs
```

This generates ignored `.env` and `deploy/livekit.local.yaml` with random secrets. It never overwrites existing configuration.

With Docker: `npm run infra`. For host-side development expose Redis locally or set REDIS_URL appropriately; the supplied Compose Redis is internal-only. With the native LiveKit binary:

```sh
livekit-server --config deploy/livekit.local.yaml
```

In two terminals run `npm run dev` and `npm run ui`, then visit **http://127.0.0.1:15173**. Use exactly this origin; localhost is a different cookie/Origin boundary. The native LiveKit binary on Windows logs that CPU monitoring is unsupported; it is suitable for local validation, not production capacity management.

## Local self-hosted stack

After setup: `docker compose up --build`. Open http://localhost:18080. All Compose components are required for full functionality. Compose's default NODE_ENV is development for loopback HTTP, not a production security profile. Redis does not save to disk by default and is not exposed to the host. Room metadata survives control-container restart while Redis remains up, but not Redis restarts; media always requires the host to reconnect.

## Public service

Use a Linux host, real domain names, HTTPS/WSS, random secrets, private Redis, reverse proxy and LiveKit's documented public IP/TURN configuration. See `deploy/Caddyfile.example` and the [official guide](https://docs.livekit.io/transport/self-hosting/deployment/). Set NODE_ENV=production, APP_ORIGIN to the exact app HTTPS origin, LIVEKIT_URL to the public WSS origin, and LIVEKIT_INTERNAL_URL to a private admin endpoint.

Do not expose the development YAML, development HTTP ports or Redis. Customize the Compose port mappings and bind addresses for your reverse proxy; TURN/TLS may need a separate address/port. Keep the app to one replica. Do not put this project behind an edge runtime that lacks long-lived WebSockets, UDP or the required media service connectivity.

Ingress is one set of encoded film tracks (simulcast can send several quality layers), not one full upload per friend. SFU egress still grows with viewer count. Budget outbound traffic, CPU, memory and connection quotas. Recording/egress is not configured.

## Verification

`npm run check`; `npm run test:e2e`; `npm run test:media` generates FFmpeg fixtures. `MEDIA_E2E=1 npm run test:e2e` additionally exercises the actual local SFU and requires the generated fixtures and a running LiveKit server. Windows PowerShell: `$env:MEDIA_E2E='1'; npm run test:e2e`.

No cloud accounts, domain purchases, public deployment or GitHub publication are performed by these commands.
