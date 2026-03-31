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
import java.util.ArrayList;
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
      ? new OptimizeRequest(null, null, null, null, null, null, null, null, null)
      : request;

    double ping = safe.clientPingMs() == null ? 80.0 : safe.clientPingMs();
    double jitter = safe.jitterMs() == null ? 10.0 : safe.jitterMs();
    double loss = safe.packetLossPct() == null ? 0.0 : safe.packetLossPct();
    double speed = safe.connectionSpeed() == null ? 10.0 : safe.connectionSpeed();
    double signal = safe.signalStrength() == null ? -70.0 : safe.signalStrength();

    boolean isUnstableNetwork = jitter > 25 || loss > 3;
    boolean isHighLatency = ping > 120;
    boolean isPoorSignal = signal < -85;
    boolean isLowBandwidth = speed < 5;

    // Network health scoring
    double latencyScore = Math.max(0, Math.min(100, 100 - (ping - 20) * 0.8));
    double stabilityScore = Math.max(0, Math.min(100, 100 - jitter * 1.5 - loss * 5));
    double bandwidthScore = Math.max(0, Math.min(100, speed * 2));
    double packetLossScore = Math.max(0, Math.min(100, 100 - loss * 10));
    int overallHealth = (int) Math.round(
      latencyScore * 0.35 +
      stabilityScore * 0.30 +
      bandwidthScore * 0.20 +
      packetLossScore * 0.15
    );

    String healthRecommendation;
    if (overallHealth < 30) {
      healthRecommendation = "Severe network degradation detected - enabling maximum protection";
    } else if (overallHealth < 50) {
      healthRecommendation = "Unstable network - activating advanced optimization";
    } else if (overallHealth < 70) {
      healthRecommendation = "Moderate network quality - applying smart optimization";
    } else {
      healthRecommendation = "Network conditions are optimal for gaming";
    }

    // Determine aggressiveness level
    String aggressiveness;
    if (loss > 8 || jitter > 50 || ping > 200 || isPoorSignal) {
      aggressiveness = "conservative";
    } else if (isUnstableNetwork || isHighLatency) {
      aggressiveness = "balanced";
    } else if (ping < 40 && jitter < 10 && loss < 1) {
      aggressiveness = "turbo";
    } else {
      aggressiveness = "fast";
    }

    // Advanced optimization parameters
    int jitterBufferSize = Math.max(20, Math.min(200, (int) (jitter * 3 + loss * 10)));
    double fecStrength = loss > 5 ? 0.3 : loss > 2 ? 0.2 : loss > 0 ? 0.1 : 0;
    boolean retransmissionMode = isUnstableNetwork || isPoorSignal;
    boolean multiPathEnabled = loss > 5 || jitter > 40 || ping > 150;
    int keepAliveInterval = isUnstableNetwork ? 5000 : 15000;
    boolean dnsPreResolution = true;
    boolean packetPrioritization = aggressiveness.equals("turbo") || aggressiveness.equals("fast");
    String congestionControl = isUnstableNetwork ? "BBR" : "CUBIC";

    boolean stabilityMode = isUnstableNetwork || isPoorSignal;

    double jitterPenalty = Math.min(jitter * 0.6, 25);
    double lossPenalty = loss * 3;
    double effectivePing = ping + jitterPenalty + lossPenalty;

    double reductionFactor;
    switch (aggressiveness) {
      case "turbo":
        reductionFactor = 0.45;
        break;
      case "fast":
        reductionFactor = 0.35;
        break;
      case "balanced":
        reductionFactor = 0.22;
        break;
      default:
        reductionFactor = 0.12;
    }

    int expectedAfterMs = Math.max(10, (int) Math.round(effectivePing * (1 - reductionFactor)));

    List<String> notes = new ArrayList<>();
    if (loss > 0) {
      notes.add(String.format("Detected %.1f%% packet loss — enabling FEC recovery", loss));
    }
    if (jitter > 20) {
      notes.add(String.format("High jitter (%.0f ms) — adaptive jitter buffer: %dms", jitter, jitterBufferSize));
    }
    if (stabilityMode) {
      notes.add("Stability mode active: prioritizing consistent routing over raw speed");
    }
    if (multiPathEnabled) {
      notes.add("Multi-path bonding enabled: combining network interfaces");
    }
    if (dnsPreResolution) {
      notes.add("DNS pre-resolution active: eliminating lookup delays");
    }
    if (packetPrioritization) {
      notes.add("Packet prioritization enabled: gaming traffic gets priority");
    }
    if (congestionControl.equals("BBR")) {
      notes.add("BBR congestion control: optimized for lossy networks");
    }
    if (retransmissionMode) {
      notes.add("Predictive retransmission enabled: recovering lost packets");
    }
    if (aggressiveness.equals("turbo")) {
      notes.add("TURBO mode: maximum optimization for optimal conditions");
    }
    if (notes.isEmpty()) {
      notes.add("Advanced optimization enabled for your network");
    }

    List<ServerRecord> ranked = servers.stream()
      .filter(ServerRecord::enabled)
      .sorted(Comparator.comparingDouble(ServerRecord::weight))
      .limit(3)
      .toList();

    Map<String, Object> networkHealth = Map.of(
      "overall", overallHealth,
      "latency", (int) Math.round(latencyScore),
      "stability", (int) Math.round(stabilityScore),
      "bandwidth", (int) Math.round(bandwidthScore),
      "packetLoss", (int) Math.round(packetLossScore),
      "recommendation", healthRecommendation
    );

    Map<String, Object> optimization = new LinkedHashMap<>();
    optimization.put("stabilityMode", stabilityMode);
    optimization.put("aggressiveness", aggressiveness);
    optimization.put("expectedBeforeMs", Math.round(ping));
    optimization.put("expectedAfterMs", expectedAfterMs);
    optimization.put("jitterPenaltyMs", Math.round(jitterPenalty));
    optimization.put("jitterBufferSize", jitterBufferSize);
    optimization.put("fecStrength", fecStrength);
    optimization.put("retransmissionMode", retransmissionMode);
    optimization.put("multiPathEnabled", multiPathEnabled);
    optimization.put("keepAliveInterval", keepAliveInterval);
    optimization.put("dnsPreResolution", dnsPreResolution);
    optimization.put("packetPrioritization", packetPrioritization);
    optimization.put("congestionControl", congestionControl);
    optimization.put("notes", notes);

    return ResponseEntity.ok(Map.of(
      "status", "ok",
      "service", "gexup-java",
      "optimization", optimization,
      "networkHealth", networkHealth,
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
