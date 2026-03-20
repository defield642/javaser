package com.gexup.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import android.net.VpnService
import android.content.pm.ServiceInfo
import com.gexup.R
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class GexupVpnService : VpnService() {
  private var tun: ParcelFileDescriptor? = null
  private val handler = Handler(Looper.getMainLooper())
  private var startTime: Long = 0L
  private var currentGameName: String = "Game"
  private var relayHost: String = ""
  private var relayPort: Int = 443
  private var relayPath: String = "/relay/socket"
  private var relayToken: String = ""
  private var relayConnected: Boolean = false
  private var relaySocket: WebSocket? = null
  private val httpClient by lazy {
    OkHttpClient.Builder()
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .connectTimeout(10, TimeUnit.SECONDS)
      .build()
  }
  private val prefs by lazy {
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }
  private val ticker = object : Runnable {
    override fun run() {
      if (relayConnected && relayToken.isNotBlank()) {
        relaySocket?.send("KEEPALIVE $relayToken")
      }
      updateNotification()
      handler.postDelayed(this, 1000)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    android.util.Log.d("GexupVpnService", "onStartCommand called")
    try {
      currentGameName = intent?.getStringExtra(EXTRA_GAME_NAME) ?: "Game"
      relayHost = intent?.getStringExtra(EXTRA_RELAY_HOST) ?: relayHost
      relayPort = intent?.getIntExtra(EXTRA_RELAY_PORT, relayPort) ?: relayPort
      relayPath = intent?.getStringExtra(EXTRA_RELAY_PATH) ?: relayPath
      relayToken = intent?.getStringExtra(EXTRA_RELAY_TOKEN) ?: relayToken
      if (startTime == 0L) startTime = System.currentTimeMillis()
      persistState(true)
      ensureChannel()
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }

      if (tun == null) {
        val builder = Builder()
          .setSession("GeXuP VPN")
          .addAddress("10.8.0.2", 32)
          .addDnsServer("1.1.1.1")
          .addDnsServer("8.8.8.8")
          .setMtu(1500)
        tun = builder.establish()
        android.util.Log.d("GexupVpnService", "VPN tunnel established")
      }

      handler.removeCallbacks(ticker)
      handler.post(ticker)
      connectRelaySocket()
      android.util.Log.d("GexupVpnService", "onStartCommand completed successfully")
      return START_STICKY
    } catch (e: Exception) {
      android.util.Log.e("GexupVpnService", "Exception in onStartCommand", e)
      stopSelf()
      return START_NOT_STICKY
    }
  }

  override fun onDestroy() {
    android.util.Log.d("GexupVpnService", "onDestroy called")
    handler.removeCallbacks(ticker)
    try {
      relaySocket?.close(1000, "stopping")
    } catch (_: Exception) {
    }
    relaySocket = null
    relayConnected = false
    try {
      tun?.close()
      android.util.Log.d("GexupVpnService", "VPN tunnel closed")
    } catch (e: Exception) {
      android.util.Log.e("GexupVpnService", "Exception closing VPN tunnel", e)
    }
    tun = null
    persistState(false)
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
      android.util.Log.d("GexupVpnService", "stopForeground called")
    } catch (e: Exception) {
      android.util.Log.e("GexupVpnService", "Exception in stopForeground", e)
    }
    super.onDestroy()
    android.util.Log.d("GexupVpnService", "onDestroy completed")
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "VPN",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "VPN status"
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val elapsed = if (startTime == 0L) 0 else (System.currentTimeMillis() - startTime) / 1000
    val minutes = elapsed / 60
    val seconds = elapsed % 60
    val timeLabel = String.format("%02d:%02d", minutes, seconds)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("GeXuP VPN")
      .setContentText(
        "$currentGameName · $relayHost:$relayPort · ${if (relayConnected) "relay-on" else "relay-off"} · $timeLabel"
      )
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .build()
  }

  private fun updateNotification() {
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun persistState(active: Boolean) {
    prefs.edit()
      .putBoolean(PREF_ACTIVE, active)
      .putLong(PREF_START_TIME, if (active) startTime else 0L)
      .putString(PREF_GAME_NAME, if (active) currentGameName else "")
      .putString(PREF_RELAY_HOST, if (active) relayHost else "")
      .putInt(PREF_RELAY_PORT, if (active) relayPort else 0)
      .putString(PREF_RELAY_PATH, if (active) relayPath else "")
      .putString(PREF_RELAY_TOKEN, if (active) relayToken else "")
      .putBoolean(PREF_RELAY_CONNECTED, active && relayConnected)
      .apply()
  }

  private fun connectRelaySocket() {
    if (relayHost.isBlank()) return
    relaySocket?.cancel()
    relayConnected = false
    val scheme = if (relayPort == 443) "wss" else "ws"
    val path = if (relayPath.startsWith("/")) relayPath else "/$relayPath"
    val request = Request.Builder()
      .url("$scheme://$relayHost:$relayPort$path")
      .build()
    relaySocket = httpClient.newWebSocket(request, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        relayConnected = true
        persistState(true)
        updateNotification()
        webSocket.send("HELLO $relayToken $currentGameName")
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        if (text.startsWith("ALIVE") || text.startsWith("OK") || text.startsWith("READY")) {
          relayConnected = true
          persistState(true)
          return
        }
      }

      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        relayConnected = false
        persistState(true)
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        relayConnected = false
        persistState(true)
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        relayConnected = false
        persistState(true)
      }
    })
  }

  companion object {
    const val CHANNEL_ID = "gexup_vpn"
    const val NOTIFICATION_ID = 2001
    const val EXTRA_GAME_NAME = "extra_game_name"
    const val EXTRA_RELAY_HOST = "extra_relay_host"
    const val EXTRA_RELAY_PORT = "extra_relay_port"
    const val EXTRA_RELAY_PATH = "extra_relay_path"
    const val EXTRA_RELAY_TOKEN = "extra_relay_token"
    const val PREFS_NAME = "gexup_vpn"
    const val PREF_ACTIVE = "active"
    const val PREF_START_TIME = "start_time"
    const val PREF_GAME_NAME = "game_name"
    const val PREF_RELAY_HOST = "relay_host"
    const val PREF_RELAY_PORT = "relay_port"
    const val PREF_RELAY_PATH = "relay_path"
    const val PREF_RELAY_TOKEN = "relay_token"
    const val PREF_RELAY_CONNECTED = "relay_connected"
  }
}
