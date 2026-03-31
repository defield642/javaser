package com.gexup.backend.api;

public record OptimizeRequest(
  String gameId,
  Double clientPingMs,
  Double jitterMs,
  Double packetLossPct,
  String networkType,
  String country,
  Double connectionSpeed,
  Double signalStrength,
  Boolean batteryOptimization
) {}
