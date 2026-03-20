package com.gexup.backend.api;

public record ServerRecord(
  String id,
  String name,
  String region,
  String city,
  String country,
  String provider,
  String pingUrl,
  boolean enabled,
  double weight
) {}
