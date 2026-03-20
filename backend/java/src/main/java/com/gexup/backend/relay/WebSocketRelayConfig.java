package com.gexup.backend.relay;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketRelayConfig implements WebSocketConfigurer {

  private final RelayWebSocketHandler relayWebSocketHandler;

  @Autowired
  public WebSocketRelayConfig(RelayWebSocketHandler relayWebSocketHandler) {
    this.relayWebSocketHandler = relayWebSocketHandler;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry
      .addHandler(relayWebSocketHandler, "/relay/socket")
      .setAllowedOriginPatterns("*");
  }
}
