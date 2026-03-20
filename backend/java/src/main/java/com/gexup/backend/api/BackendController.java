package com.gexup.backend.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/")
public class BackendController {

  @Value("${relay.token:render-dev-token}")
  private String relayToken;

  private final List<ServerRecord> servers = List.of(
    new ServerRecord(
      "cf-primary",
      "Cloudflare Primary",
      "global",
      "Global",
      "Global",
      "Cloudflare",
      "https://gexup-ping.ti23.workers.dev/",
      true,
      1.0
    ),
    new ServerRecord(
      "cf-secondary",
      "Cloudflare Secondary",
      "eu",
      "Frankfurt",
      "Germany",
      "Cloudflare",
      "https://wispy-sky-b1e1.ti23.workers.dev/",
      true,
      1.05
    ),
    new ServerRecord(
      "cf-tertiary",
      "Cloudflare Tertiary",
      "af",
      "Nairobi",
      "Kenya",
      "Cloudflare",
      "https://weathered-sound-2133.ti23.workers.dev/",
      true,
      1.1
    )
  );

  @GetMapping("health")
  public ResponseEntity<?> health() {
    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "service", "gexup-java",
      "time", Instant.now().toString()
    ));
  }

  @GetMapping("ping")
  public ResponseEntity<?> ping() {
    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "service", "gexup-java",
      "time", Instant.now().toString()
    ));
  }

  @GetMapping("servers")
  public ResponseEntity<?> servers() {
    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "count", servers.size(),
      "servers", servers
    ));
  }

  @PostMapping("optimize")
  public ResponseEntity<?> optimize(@RequestBody(required = false) OptimizeRequest request) {
    OptimizeRequest safe = request == null
      ? new OptimizeRequest(null, null, null, null, null, null)
      : request;

    double ping = safe.clientPingMs() == null ? 80.0 : safe.clientPingMs();
    double jitter = safe.jitterMs() == null ? 10.0 : safe.jitterMs();
    double loss = safe.packetLossPct() == null ? 0.0 : safe.packetLossPct();

    boolean stabilityMode = loss > 2.0 || jitter > 30.0 || ping > 120.0;
    String aggressiveness = ping > 150.0 || loss > 5.0
      ? "conservative"
      : ping > 90.0
      ? "balanced"
      : "fast";

    List<ServerRecord> ranked = servers.stream()
      .filter(ServerRecord::enabled)
      .sorted(Comparator.comparingDouble(ServerRecord::weight))
      .limit(3)
      .toList();

    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "service", "gexup-java",
      "optimization", Map.of(
        "stabilityMode", stabilityMode,
        "aggressiveness", aggressiveness,
        "expectedBeforeMs", Math.round(ping),
        "expectedAfterMs", Math.max(10, Math.round(ping - Math.min(20, jitter * 0.2))),
        "notes", List.of(
          "This backend improves server choice and recovery policy.",
          "It cannot turn a poor ISP path into true low ping without better routing infrastructure."
        )
      ),
      "recommendedServers", ranked,
      "gameId", safe.gameId(),
      "networkType", safe.networkType(),
      "country", safe.country()
    ));
  }

  @PostMapping("tunnel/config")
  public ResponseEntity<?> tunnelConfig(
    @RequestBody(required = false) TunnelRequest request,
    HttpServletRequest httpRequest
  ) {
    TunnelRequest safe = request == null
      ? new TunnelRequest(null, null, null, null)
      : request;
    String requestHost = httpRequest.getServerName();
    int requestPort = httpRequest.getServerPort();
    String forwardedProto = httpRequest.getHeader("x-forwarded-proto");
    boolean tls = forwardedProto == null
      ? httpRequest.isSecure() || requestPort == 443
      : "https".equalsIgnoreCase(forwardedProto);
    int relayPort = requestPort > 0 ? requestPort : (tls ? 443 : 80);
    Map<String, Object> relay = new LinkedHashMap<>();
    relay.put("host", requestHost);
    relay.put("port", relayPort);
    relay.put("path", "/relay/socket");
    relay.put("transport", "websocket");
    relay.put("tls", tls);
    relay.put("token", relayToken);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("status", "ok");
    response.put("service", "gexup-java");
    response.put("provider", "render-relay");
    response.put("supported", true);
    response.put("sessionId", UUID.randomUUID().toString());
    response.put("tunnelMode", "relay-edge");
    response.put("relay", relay);
    response.put("routes", List.of("0.0.0.0/0"));
    response.put("dns", List.of("1.1.1.1", "8.8.8.8"));
    response.put("requestedGame", safe.packageName() != null ? safe.packageName() : safe.gameId());
    response.put("preferredRegion", safe.preferredRegion());
    response.put("networkType", safe.networkType());
    response.put(
      "notes",
      List.of(
        "This endpoint returns relay configuration for the Android tunnel client.",
        "Traffic improvement requires a real relay process behind this endpoint."
      )
    );

    return ResponseEntity.ok(response);
  }

  @GetMapping("relay/health")
  public ResponseEntity<?> relayHealth() {
    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "service", "gexup-java",
      "relayReachable", true,
      "mode", "relay-edge",
      "time", Instant.now().toString()
    ));
  }
}
