package com.gexup.backend.api;

public record TunnelRequest(
  String gameId,
  String packageName,
  String preferredRegion,
  String networkType
) {}
