package com.gexup.backend.relay;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;

@Component
public class RelayWebSocketHandler extends TextWebSocketHandler {

  @Value("${relay.token:render-dev-token}")
  private String relayToken;

  @Value("${relay.connect-timeout-ms:2000}")
  private int connectTimeoutMs;

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    session.sendMessage(new TextMessage("READY relay-edge"));
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    String payload = message.getPayload() == null ? "" : message.getPayload().trim();
    if (payload.isBlank()) {
      session.sendMessage(new TextMessage("ERROR empty"));
      return;
    }

    String[] parts = payload.split("\\s+");
    String command = parts[0].toUpperCase();

    if ("HELLO".equals(command)) {
      if (!isAuthorized(parts, 2)) {
        session.sendMessage(new TextMessage("ERROR unauthorized"));
        return;
      }
      String gameName = parts.length > 2 ? payload.substring(payload.indexOf(parts[2])) : "unknown";
      session.getAttributes().put("game", gameName);
      session.sendMessage(new TextMessage("OK hello " + gameName));
      return;
    }

    if ("KEEPALIVE".equals(command)) {
      if (!isAuthorized(parts, 1)) {
        session.sendMessage(new TextMessage("ERROR unauthorized"));
        return;
      }
      session.sendMessage(new TextMessage("ALIVE " + System.currentTimeMillis()));
      return;
    }

    if ("PING".equals(command)) {
      if (!isAuthorized(parts, 3)) {
        session.sendMessage(new TextMessage("ERROR unauthorized"));
        return;
      }
      String host = parts[2];
      int port = parsePort(parts[3]);
      if (port <= 0) {
        session.sendMessage(new TextMessage("ERROR invalid-port"));
        return;
      }
      long startedAt = System.nanoTime();
      try (Socket socket = new Socket()) {
        socket.connect(new InetSocketAddress(host, port), connectTimeoutMs);
        long elapsedMs = Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
        session.sendMessage(new TextMessage("PONG " + elapsedMs));
      } catch (Exception error) {
        session.sendMessage(new TextMessage("ERROR " + sanitize(error.getMessage())));
      }
      return;
    }

    session.sendMessage(new TextMessage("ERROR unsupported-command"));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    session.getAttributes().clear();
  }

  private boolean isAuthorized(String[] parts, int requiredIndex) {
    return parts.length > requiredIndex && relayToken.equals(parts[1]);
  }

  private int parsePort(String value) {
    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException error) {
      return -1;
    }
  }

  private String sanitize(String value) {
    if (value == null || value.isBlank()) {
      return "relay-failure";
    }
    return value.replace('\n', ' ').replace('\r', ' ').trim();
  }
}
