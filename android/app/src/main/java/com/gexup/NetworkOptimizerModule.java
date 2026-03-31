package com.gexup;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashMap;
import java.util.Map;

public class NetworkOptimizerModule extends ReactContextBaseJavaModule {

  private static final String MODULE_NAME = "NetworkOptimizer";
  private NetworkOptimizer optimizer;

  public NetworkOptimizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  private NetworkOptimizer getOptimizer() {
    if (optimizer == null) {
      optimizer = new NetworkOptimizer(getReactApplicationContext());
      optimizer.addHealthListener(health -> {
        WritableMap params = Arguments.createMap();
        params.putInt("overallScore", health.overallScore);
        params.putInt("latencyScore", health.latencyScore);
        params.putInt("stabilityScore", health.stabilityScore);
        params.putInt("bandwidthScore", health.bandwidthScore);
        params.putInt("packetLossScore", health.packetLossScore);
        params.putDouble("pingMs", health.pingMs);
        params.putDouble("jitterMs", health.jitterMs);
        params.putDouble("packetLossPct", health.packetLossPct);
        params.putDouble("bandwidthMbps", health.bandwidthMbps);
        params.putBoolean("isUnstable", health.isUnstable);
        params.putBoolean("multiPathActive", health.multiPathActive);
        params.putInt("jitterBufferSize", health.jitterBufferSize);
        params.putDouble("fecStrength", health.fecStrength);
        params.putBoolean("retransmissionActive", health.retransmissionActive);
        params.putString("recommendation", health.recommendation);

        getReactApplicationContext()
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
          .emit("networkHealthUpdate", params);
      });
    }
    return optimizer;
  }

  @ReactMethod
  public void startOptimization(Promise promise) {
    try {
      getOptimizer().startOptimization();
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("START_ERROR", e);
    }
  }

  @ReactMethod
  public void stopOptimization(Promise promise) {
    try {
      getOptimizer().stopOptimization();
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("STOP_ERROR", e);
    }
  }

  @ReactMethod
  public void updateNetworkMetrics(ReadableMap metrics, Promise promise) {
    try {
      long ping = metrics.hasKey("pingMs") ? (long) metrics.getDouble("pingMs") : 80;
      long jitter = metrics.hasKey("jitterMs") ? (long) metrics.getDouble("jitterMs") : 10;
      long loss = metrics.hasKey("packetLossPct") ? (long) metrics.getDouble("packetLossPct") : 0;
      
      getOptimizer().updateNetworkMetrics(ping, jitter, loss);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("METRICS_ERROR", e);
    }
  }

  @ReactMethod
  public void onPacketReceived(Promise promise) {
    try {
      getOptimizer().onPacketReceived(System.currentTimeMillis());
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("PACKET_ERROR", e);
    }
  }

  @ReactMethod
  public void getJitterBufferSize(Promise promise) {
    try {
      promise.resolve(getOptimizer().getJitterBufferSize());
    } catch (Exception e) {
      promise.reject("JITTER_ERROR", e);
    }
  }

  @ReactMethod
  public void enablePredictiveRetransmission(boolean enabled, Promise promise) {
    try {
      getOptimizer().enablePredictiveRetransmission(enabled);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("RETRANSMISSION_ERROR", e);
    }
  }

  @ReactMethod
  public void preResolveDns(String hostname, Promise promise) {
    try {
      getOptimizer().preResolveDns(hostname);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("DNS_ERROR", e);
    }
  }

  @ReactMethod
  public void getNetworkHealth(Promise promise) {
    try {
      NetworkOptimizer optimizer = getOptimizer();
      WritableMap health = Arguments.createMap();
      health.putBoolean("isOptimizing", optimizer.isOptimizing());
      health.putBoolean("multiPathEnabled", optimizer.isMultiPathEnabled());
      health.putBoolean("retransmissionEnabled", optimizer.isRetransmissionEnabled());
      health.putDouble("keepAliveInterval", optimizer.getKeepAliveInterval());
      health.putInt("jitterBufferSize", optimizer.getJitterBufferSize());
      health.putDouble("fecStrength", optimizer.getFecStrength());
      health.putInt("fecPacketsSent", optimizer.getFecPacketsSent());
      health.putInt("fecPacketsRecovered", optimizer.getFecPacketsRecovered());
      promise.resolve(health);
    } catch (Exception e) {
      promise.reject("HEALTH_ERROR", e);
    }
  }

  @ReactMethod
  public void addListener(String eventName) {
    // Keep: Required for RN built in Event Emitter Calls
  }

  @ReactMethod
  public void removeListeners(Integer count) {
    // Keep: Required for RN built in Event Emitter Calls
  }
}
