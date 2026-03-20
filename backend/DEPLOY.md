# Backend Deploy

## Cloudflare Worker

1. `cd backend/worker`
2. Update `wrangler.jsonc` if you want a different worker name.
3. Deploy:

```bash
wrangler deploy
```

Expected routes:
- `/health`
- `/ping`
- `/servers`
- `/optimize`
- `/tunnel/config`
- `/relay/health`
- WebSocket `/relay/socket`

## Render Java Service

Render can use [render.yaml](/home/defield-timmy/gexup/backend/java/render.yaml) or manual setup.

Manual values:
- Root directory: `backend/java`
- Build command: `mvn package`
- Start command: `java -jar target/gexup-java-backend-0.1.0.jar`

## App Wiring

The app is currently wired to:
- `https://weathered-sound-2133.ti23.workers.dev`
- `https://gexup.onrender.com`

The app will then:
- fetch server list from `/servers`
- fetch optimization guidance from `/optimize`
- fetch relay/tunnel profile from `/tunnel/config`
- show backend-driven `Before` and `After` values on the boost screen
- prepare the Android VPN layer with relay host, port, path, and token
- open a WebSocket relay session against the Java backend on Render

## Constraint

The repo now contains a real relay control path and a live relay socket session.

To truly improve a poor network path you still need:
- packet forwarding from the Android VPN service into the relay connection
- relay-side forwarding logic beyond ping and keepalive control messages
- traffic classification so only intended game flows are routed into the relay
