# Cloudflare Worker and Java Backend API Test Guide

This guide helps you verify that your backend and worker are responding correctly and robustly, even on unstable networks.

## 1. Test Cloudflare Worker Endpoints

Open these URLs in your browser (or use curl/Postman):

- `https://gexup-ping.ti23.workers.dev/ping`
- `https://gexup-ping.ti23.workers.dev/health`
- `https://gexup-ping.ti23.workers.dev/servers`

You should see a JSON response with `status: "ok"`.

### Test /optimize endpoint (POST)

Use curl or Postman:

```
curl -X POST "https://gexup-ping.ti23.workers.dev/optimize" \
  -H "Content-Type: application/json" \
  -d '{"clientPingMs": 800, "jitterMs": 120, "packetLossPct": 10}'
```

You should get a JSON response with `aggressiveness: "conservative"` and recommended servers.

---

## 2. Test Java Backend Endpoints

If running locally:
- `http://localhost:8080/health`
- `http://localhost:8080/ping`
- `http://localhost:8080/servers`

If deployed, use your public backend URL with those endpoints.

### Test /optimize endpoint (POST)

```
curl -X POST "http://localhost:8080/optimize" \
  -H "Content-Type: application/json" \
  -d '{"clientPingMs": 800, "jitterMs": 120, "packetLossPct": 10}'
```

You should get a JSON response with `aggressiveness: "conservative"` and recommended servers.

---

## 3. Troubleshooting

- If you get a 404 at the root URL, try `/ping` or `/health`.
- If you get no response, check logs in Cloudflare dashboard or your Java server logs.
- Make sure environment variables are set for the worker if needed.
- For relay/worker issues, check that the relay host and port are correct and reachable.

---

## 4. Making the Backend More Robust

- Lower the thresholds for switching to "conservative" mode in both the worker and Java backend if you want more aggressive fallback.
- Add more fallback servers to the server list.
- Improve error handling in the relay handler (catch and log all exceptions, return clear error messages).

---

## 5. Next Steps

- Run the above tests and confirm you get valid JSON responses.
- If you need to automate these checks, consider writing a simple script or using a monitoring tool.

---

If you want me to patch the backend/worker code to make it even more robust, let me know your specific requirements (e.g., lower thresholds, more logging, etc.).
