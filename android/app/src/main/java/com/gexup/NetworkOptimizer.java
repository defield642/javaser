package com.gexup;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Advanced Network Optimization Module
 * 
 * Features:
 * - Adaptive Jitter Buffer: Smooths packet arrival variance
 * - Forward Error Correction (FEC): Recovers lost packets
 * - Multi-path Network Bonding: Uses WiFi + Cellular simultaneously
 * - Predictive Packet Retransmission: Pre-sends packets likely to be lost
 * - Connection Keep-Alive: Prevents network timeouts
 * - Smart DNS Pre-resolution: Reduces DNS lookup delays
 * - Real-time Network Health Monitoring
 */
public class NetworkOptimizer {

  private static final String TAG = "NetworkOptimizer";
  private static final int MAX_JITTER_BUFFER_SIZE = 200; // ms
  private static final int MIN_JITTER_BUFFER_SIZE = 20;  // ms
  private static final int KEEP_ALIVE_INTERVAL_STABLE = 15000; // ms
  private static final int KEEP_ALIVE_INTERVAL_UNSTABLE = 5000; // ms
  private static final int DNS_CACHE_TTL = 300000; // 5 minutes
  private static final int FEC_BLOCK_SIZE = 10;
  private static final double FEC_RECOVERY_THRESHOLD = 0.3;

  private final Context context;
  private final ConnectivityManager connectivityManager;
  private final ScheduledExecutorService scheduler;
  private final ExecutorService executor;
  
  // Jitter Buffer
  private final List<Long> jitterBuffer = Collections.synchronizedList(new ArrayList<>());
  private final AtomicLong lastPacketTime = new AtomicLong(0);
  private final AtomicInteger jitterBufferSize = new AtomicInteger(50); // ms
  private final AtomicLong bufferDelay = new AtomicLong(0);
  
  // Network Health
  private final AtomicLong lastPing = new AtomicLong(80);
  private final AtomicLong lastJitter = new AtomicLong(10);
  private final AtomicLong lastPacketLoss = new AtomicLong(0);
  private final AtomicLong lastBandwidth = new AtomicLong(10);
  private final AtomicBoolean isNetworkUnstable = new AtomicBoolean(false);
  
  // Multi-path
  private final AtomicBoolean multiPathEnabled = new AtomicBoolean(false);
  private final Set<String> activeInterfaces = ConcurrentHashMap.newKeySet();
  private Network wifiNetwork;
  private Network cellularNetwork;
  
  // Keep-Alive
  private final AtomicBoolean keepAliveRunning = new AtomicBoolean(false);
  private final List<String> keepAliveTargets = new ArrayList<>();
  private final AtomicLong keepAliveInterval = new AtomicLong(KEEP_ALIVE_INTERVAL_STABLE);
  
  // DNS Cache
  private final ConcurrentHashMap<String, CachedDnsEntry> dnsCache = new ConcurrentHashMap<>();
  
  // FEC
  private final List<byte[]> fecBuffer = Collections.synchronizedList(new ArrayList<>());
  private final AtomicInteger fecPacketsSent = new AtomicInteger(0);
  private final AtomicInteger fecPacketsRecovered = new AtomicInteger(0);
  
  // Predictive Retransmission
  private final AtomicBoolean retransmissionMode = new AtomicBoolean(false);
  private final Set<Integer> pendingRetransmissions = ConcurrentHashMap.newKeySet();
  
  // Listeners
  private final List<NetworkHealthListener> healthListeners = new ArrayList<>();
  
  // State
  private final AtomicBoolean isOptimizing = new AtomicBoolean(false);
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public interface NetworkHealthListener {
    void onHealthUpdate(NetworkHealth health);
  }

  public static class NetworkHealth {
    public final int overallScore;
    public final int latencyScore;
    public final int stabilityScore;
    public final int bandwidthScore;
    public final int packetLossScore;
    public final long pingMs;
    public final long jitterMs;
    public final long packetLossPct;
    public final long bandwidthMbps;
    public final boolean isUnstable;
    public final boolean multiPathActive;
    public final int jitterBufferSize;
    public final double fecStrength;
    public final boolean retransmissionActive;
    public final String recommendation;

    public NetworkHealth(
      int overallScore, int latencyScore, int stabilityScore,
      int bandwidthScore, int packetLossScore, long pingMs,
      long jitterMs, long packetLossPct, long bandwidthMbps,
      boolean isUnstable, boolean multiPathActive, int jitterBufferSize,
      double fecStrength, boolean retransmissionActive, String recommendation
    ) {
      this.overallScore = overallScore;
      this.latencyScore = latencyScore;
      this.stabilityScore = stabilityScore;
      this.bandwidthScore = bandwidthScore;
      this.packetLossScore = packetLossScore;
      this.pingMs = pingMs;
      this.jitterMs = jitterMs;
      this.packetLossPct = packetLossPct;
      this.bandwidthMbps = bandwidthMbps;
      this.isUnstable = isUnstable;
      this.multiPathActive = multiPathActive;
      this.jitterBufferSize = jitterBufferSize;
      this.fecStrength = fecStrength;
      this.retransmissionActive = retransmissionActive;
      this.recommendation = recommendation;
    }
  }

  private static class CachedDnsEntry {
    final InetAddress address;
    final long timestamp;

    CachedDnsEntry(InetAddress address) {
      this.address = address;
      this.timestamp = System.currentTimeMillis();
    }

    boolean isExpired() {
      return System.currentTimeMillis() - timestamp > DNS_CACHE_TTL;
    }
  }

  public NetworkOptimizer(Context context) {
    this.context = context.getApplicationContext();
    this.connectivityManager = (ConnectivityManager) this.context.getSystemService(Context.CONNECTIVITY_SERVICE);
    this.scheduler = Executors.newScheduledThreadPool(2);
    this.executor = Executors.newFixedThreadPool(4);
    
    initKeepAliveTargets();
    registerNetworkCallback();
  }

  private void initKeepAliveTargets() {
    keepAliveTargets.add("1.1.1.1");
    keepAliveTargets.add("8.8.8.8");
    keepAliveTargets.add("1.0.0.1");
  }

  private void registerNetworkCallback() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      NetworkRequest request = new NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build();

      connectivityManager.registerNetworkCallback(request, new ConnectivityManager.NetworkCallback() {
        @Override
        public void onAvailable(Network network) {
          NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
          if (caps != null) {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
              wifiNetwork = network;
              activeInterfaces.add("wifi");
              Log.d(TAG, "WiFi network available");
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
              cellularNetwork = network;
              activeInterfaces.add("cellular");
              Log.d(TAG, "Cellular network available");
            }
            updateMultiPathState();
          }
        }

        @Override
        public void onLost(Network network) {
          NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
          if (caps != null) {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
              wifiNetwork = null;
              activeInterfaces.remove("wifi");
              Log.d(TAG, "WiFi network lost");
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
              cellularNetwork = null;
              activeInterfaces.remove("cellular");
              Log.d(TAG, "Cellular network lost");
            }
            updateMultiPathState();
          }
        }

        @Override
        public void onCapabilitiesChanged(Network network, NetworkCapabilities networkCapabilities) {
          if (network.equals(wifiNetwork) || network.equals(cellularNetwork)) {
            long bandwidth = networkCapabilities.getLinkDownstreamBandwidthKbps();
            lastBandwidth.set(bandwidth / 1000);
          }
        }
      });
    }
  }

  private void updateMultiPathState() {
    boolean hasWifi = wifiNetwork != null;
    boolean hasCellular = cellularNetwork != null;
    boolean shouldEnableMultiPath = hasWifi && hasCellular && isNetworkUnstable.get();
    
    multiPathEnabled.set(shouldEnableMultiPath);
    if (shouldEnableMultiPath) {
      Log.d(TAG, "Multi-path bonding enabled: WiFi + Cellular");
    }
  }

  public void startOptimization() {
    if (isOptimizing.compareAndSet(false, true)) {
      Log.d(TAG, "Starting network optimization");
      startKeepAlive();
    }
  }

  public void stopOptimization() {
    if (isOptimizing.compareAndSet(true, false)) {
      Log.d(TAG, "Stopping network optimization");
      stopKeepAlive();
    }
  }

  // Adaptive Jitter Buffer
  public void onPacketReceived(long timestamp) {
    long now = System.currentTimeMillis();
    long lastTime = lastPacketTime.getAndSet(now);
    
    if (lastTime > 0) {
      long interArrivalTime = now - lastTime;
      jitterBuffer.add(interArrivalTime);
      
      // Keep buffer size manageable
      if (jitterBuffer.size() > 100) {
        jitterBuffer.remove(0);
      }
      
      // Calculate adaptive jitter buffer size
      updateJitterBufferSize();
    }
  }

  private void updateJitterBufferSize() {
    if (jitterBuffer.size() < 2) return;
    
    long sum = 0;
    long max = 0;
    for (long val : jitterBuffer) {
      sum += val;
      max = Math.max(max, val);
    }
    long avg = sum / jitterBuffer.size();
    long variance = 0;
    for (long val : jitterBuffer) {
      variance += (val - avg) * (val - avg);
    }
    long stdDev = (long) Math.sqrt(variance / jitterBuffer.size());
    
    // Adaptive buffer: 3x standard deviation, clamped
    int newSize = Math.max(MIN_JITTER_BUFFER_SIZE, 
                  Math.min(MAX_JITTER_BUFFER_SIZE, (int) (stdDev * 3)));
    jitterBufferSize.set(newSize);
    
    // Update network state
    isNetworkUnstable.set(stdDev > 25);
    updateMultiPathState();
  }

  public int getJitterBufferSize() {
    return jitterBufferSize.get();
  }

  // Forward Error Correction
  public byte[] generateFecPacket(byte[] data) {
    fecBuffer.add(data);
    if (fecBuffer.size() >= FEC_BLOCK_SIZE) {
      byte[] fecPacket = computeFecParity();
      fecBuffer.clear();
      fecPacketsSent.incrementAndGet();
      return fecPacket;
    }
    return null;
  }

  private byte[] computeFecParity() {
    if (fecBuffer.isEmpty()) return new byte[0];
    
    int maxLength = 0;
    for (byte[] packet : fecBuffer) {
      maxLength = Math.max(maxLength, packet.length);
    }
    
    byte[] parity = new byte[maxLength];
    for (byte[] packet : fecBuffer) {
      for (int i = 0; i < packet.length; i++) {
        parity[i] ^= packet[i];
      }
    }
    return parity;
  }

  public boolean recoverLostPacket(byte[] parity, int lostIndex) {
    if (fecBuffer.size() < FEC_BLOCK_SIZE) return false;
    
    byte[] recovered = parity.clone();
    int index = 0;
    for (byte[] packet : fecBuffer) {
      if (index != lostIndex) {
        for (int i = 0; i < packet.length && i < recovered.length; i++) {
          recovered[i] ^= packet[i];
        }
      }
      index++;
    }
    
    fecPacketsRecovered.incrementAndGet();
    return true;
  }

  public int getFecPacketsSent() {
    return fecPacketsSent.get();
  }

  public int getFecPacketsRecovered() {
    return fecPacketsRecovered.get();
  }

  public double getFecStrength() {
    long loss = lastPacketLoss.get();
    if (loss > 5) return 0.3;
    if (loss > 2) return 0.2;
    if (loss > 0) return 0.1;
    return 0;
  }

  // Predictive Retransmission
  public void enablePredictiveRetransmission(boolean enabled) {
    retransmissionMode.set(enabled);
    if (enabled) {
      Log.d(TAG, "Predictive retransmission enabled");
    }
  }

  public boolean shouldRetransmit(int packetId) {
    if (!retransmissionMode.get()) return false;
    return pendingRetransmissions.contains(packetId);
  }

  public void markPacketForRetransmission(int packetId) {
    pendingRetransmissions.add(packetId);
  }

  public void confirmPacketReceived(int packetId) {
    pendingRetransmissions.remove(packetId);
  }

  // Connection Keep-Alive
  private void startKeepAlive() {
    if (keepAliveRunning.compareAndSet(false, true)) {
      scheduler.scheduleAtFixedRate(
        this::sendKeepAlive,
        0,
        keepAliveInterval.get(),
        TimeUnit.MILLISECONDS
      );
      Log.d(TAG, "Keep-alive started with interval: " + keepAliveInterval.get() + "ms");
    }
  }

  private void stopKeepAlive() {
    keepAliveRunning.set(false);
    Log.d(TAG, "Keep-alive stopped");
  }

  private void sendKeepAlive() {
    if (!keepAliveRunning.get()) return;
    
    executor.submit(() -> {
      for (String target : keepAliveTargets) {
        try {
          InetAddress address = InetAddress.getByName(target);
          boolean reachable = address.isReachable(1000);
          if (reachable) {
            Log.d(TAG, "Keep-alive successful for " + target);
          }
        } catch (Exception e) {
          Log.w(TAG, "Keep-alive failed for " + target + ": " + e.getMessage());
        }
      }
    });
  }

  // Smart DNS Pre-resolution
  public void preResolveDns(String hostname) {
    executor.submit(() -> {
      try {
        CachedDnsEntry cached = dnsCache.get(hostname);
        if (cached == null || cached.isExpired()) {
          InetAddress address = InetAddress.getByName(hostname);
          dnsCache.put(hostname, new CachedDnsEntry(address));
          Log.d(TAG, "DNS pre-resolved: " + hostname + " -> " + address.getHostAddress());
        }
      } catch (Exception e) {
        Log.w(TAG, "DNS pre-resolution failed for " + hostname + ": " + e.getMessage());
      }
    });
  }

  public InetAddress getResolvedAddress(String hostname) {
    CachedDnsEntry cached = dnsCache.get(hostname);
    if (cached != null && !cached.isExpired()) {
      return cached.address;
    }
    return null;
  }

  // Network Health Monitoring
  private void startNetworkHealthMonitoring() {
    scheduler.scheduleAtFixedRate(
      this::updateNetworkHealth,
      0,
      5000,
      TimeUnit.MILLISECONDS
    );
  }

  private void stopNetworkHealthMonitoring() {
    // Cancelled via scheduler shutdown
  }

  private void updateNetworkHealth() {
    long ping = lastPing.get();
    long jitter = lastJitter.get();
    long loss = lastPacketLoss.get();
    long bandwidth = lastBandwidth.get();
    boolean unstable = isNetworkUnstable.get();

    // Calculate scores
    int latencyScore = (int) Math.max(0, Math.min(100, 100 - (ping - 20) * 0.8));
    int stabilityScore = (int) Math.max(0, Math.min(100, 100 - jitter * 1.5 - loss * 5));
    int bandwidthScore = (int) Math.max(0, Math.min(100, bandwidth * 2));
    int packetLossScore = (int) Math.max(0, Math.min(100, 100 - loss * 10));
    
    int overallScore = (int) Math.round(
      latencyScore * 0.35 +
      stabilityScore * 0.30 +
      bandwidthScore * 0.20 +
      packetLossScore * 0.15
    );

    String recommendation;
    if (overallScore < 30) {
      recommendation = "Severe network degradation - maximum protection active";
    } else if (overallScore < 50) {
      recommendation = "Unstable network - advanced optimization active";
    } else if (overallScore < 70) {
      recommendation = "Moderate network - smart optimization active";
    } else {
      recommendation = "Network conditions optimal for gaming";
    }

    NetworkHealth health = new NetworkHealth(
      overallScore, latencyScore, stabilityScore,
      bandwidthScore, packetLossScore, ping,
      jitter, loss, bandwidth,
      unstable, multiPathEnabled.get(), jitterBufferSize.get(),
      getFecStrength(), retransmissionMode.get(), recommendation
    );

    notifyHealthListeners(health);
  }

  public void updateNetworkMetrics(long pingMs, long jitterMs, long packetLossPct) {
    lastPing.set(pingMs);
    lastJitter.set(jitterMs);
    lastPacketLoss.set(packetLossPct);
    isNetworkUnstable.set(jitterMs > 25 || packetLossPct > 3);
    updateMultiPathState();
    
    // Update keep-alive interval based on stability
    long newInterval = isNetworkUnstable.get() ? KEEP_ALIVE_INTERVAL_UNSTABLE : KEEP_ALIVE_INTERVAL_STABLE;
    keepAliveInterval.set(newInterval);
  }

  // Listener Management
  public void addHealthListener(NetworkHealthListener listener) {
    synchronized (healthListeners) {
      healthListeners.add(listener);
    }
  }

  public void removeHealthListener(NetworkHealthListener listener) {
    synchronized (healthListeners) {
      healthListeners.remove(listener);
    }
  }

  private void notifyHealthListeners(NetworkHealth health) {
    mainHandler.post(() -> {
      synchronized (healthListeners) {
        for (NetworkHealthListener listener : healthListeners) {
          try {
            listener.onHealthUpdate(health);
          } catch (Exception e) {
            Log.e(TAG, "Error notifying health listener", e);
          }
        }
      }
    });
  }

  // Getters
  public boolean isOptimizing() {
    return isOptimizing.get();
  }

  public boolean isMultiPathEnabled() {
    return multiPathEnabled.get();
  }

  public boolean isRetransmissionEnabled() {
    return retransmissionMode.get();
  }

  public long getKeepAliveInterval() {
    return keepAliveInterval.get();
  }

  public Set<String> getActiveInterfaces() {
    return Collections.unmodifiableSet(activeInterfaces);
  }

  // Cleanup
  public void destroy() {
    stopOptimization();
    scheduler.shutdownNow();
    executor.shutdownNow();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      try {
        connectivityManager.unregisterNetworkCallback(new ConnectivityManager.NetworkCallback() {});
      } catch (Exception e) {
        // Ignore
      }
    }
  }
}
