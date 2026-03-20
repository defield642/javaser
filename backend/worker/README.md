# Gexup Worker Backend

Deploy with `wrangler deploy`.

Routes:
- `GET /health`
- `GET /ping`
- `GET /servers`
- `POST /optimize`

Optional variables:
- `SERVER_MATRIX`
  JSON array of server records.
- `DEFAULT_REGION`
  Display region for health output.

Example optimize payload:

```json
{
  "gameId": "com.ea.gp.fifamobile",
  "clientPingMs": 72,
  "jitterMs": 14,
  "packetLossPct": 1.2,
  "networkType": "wifi",
  "country": "NG"
}
```
