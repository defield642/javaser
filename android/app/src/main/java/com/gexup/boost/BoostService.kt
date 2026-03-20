package com.gexup.boost

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import android.content.pm.ServiceInfo
import com.gexup.R

class BoostService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var startTime: Long = 0L
  private var currentGameName: String = "Game"
  private var currentServerName: String = ""
  private var currentPing: Int = -1
  private var wakeLock: PowerManager.WakeLock? = null
  private val prefs by lazy {
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }
  private val ticker = object : Runnable {
    override fun run() {
      updateNotification()
      handler.postDelayed(this, 5000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureWakeLock()
    if (startTime == 0L) {
      startTime = prefs.getLong(PREF_START_TIME, 0L)
    }
    val cachedName = prefs.getString(PREF_GAME_NAME, null)
    if (!cachedName.isNullOrBlank()) {
      currentGameName = cachedName
    }
    val cachedServer = prefs.getString(PREF_SERVER_NAME, null)
    if (!cachedServer.isNullOrBlank()) {
      currentServerName = cachedServer
    }
    currentPing = prefs.getInt(PREF_PING, -1)
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      clearBoostState()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    // Log all received extras for debugging
    val logValues = StringBuilder()
    val gameNameRaw = intent?.getStringExtra(EXTRA_GAME_NAME) ?: "Game"
    val packageNameRaw = intent?.getStringExtra(EXTRA_GAME_PACKAGE) ?: ""
    val serverNameRaw = intent?.getStringExtra(EXTRA_SERVER_NAME) ?: ""
    val pingRaw = intent?.getIntExtra(EXTRA_PING, -1) ?: -1
    logValues.append("Received extras: gameName='").append(gameNameRaw)
      .append("', packageName='").append(packageNameRaw)
      .append("', serverName='").append(serverNameRaw)
      .append("', ping='").append(pingRaw).append("'")
    android.util.Log.d("BoostService", logValues.toString())

    // Sanitize values (remove newlines and trim)
    val gameName = gameNameRaw.replace("\n", " ").replace("\r", " ").trim()
    val packageName = packageNameRaw.replace("\n", " ").replace("\r", " ").trim()
    val serverName = serverNameRaw.replace("\n", " ").replace("\r", " ").trim()
    val ping = pingRaw

    currentGameName = gameName
    currentServerName = serverName
    currentPing = ping
    if (startTime == 0L) startTime = System.currentTimeMillis()
    prefs.edit()
      .putLong(PREF_START_TIME, startTime)
      .putString(PREF_GAME_NAME, currentGameName)
      .putString(PREF_GAME_PACKAGE, packageName)
      .putString(PREF_SERVER_NAME, serverName)
      .putInt(PREF_PING, ping)
      .putBoolean(PREF_ACTIVE, true)
      .apply()
    val notification = buildNotification(gameName)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    handler.removeCallbacks(ticker)
    handler.post(ticker)
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (!prefs.getBoolean(PREF_ACTIVE, false)) return
    val restartIntent = Intent(applicationContext, BoostService::class.java)
    restartIntent.putExtra(EXTRA_GAME_NAME, currentGameName)
    restartIntent.putExtra(EXTRA_SERVER_NAME, currentServerName)
    restartIntent.putExtra(EXTRA_PING, currentPing)
    ContextCompat.startForegroundService(applicationContext, restartIntent)
  }

  override fun onDestroy() {
    super.onDestroy()
    handler.removeCallbacks(ticker)
    stopForeground(STOP_FOREGROUND_REMOVE)
    releaseWakeLock()
  }

  private fun clearBoostState() {
    startTime = 0L
    currentGameName = "Game"
    currentServerName = ""
    currentPing = -1
    prefs.edit()
      .remove(PREF_START_TIME)
      .remove(PREF_GAME_NAME)
      .remove(PREF_GAME_PACKAGE)
      .remove(PREF_SERVER_NAME)
      .remove(PREF_PING)
      .putBoolean(PREF_ACTIVE, false)
      .apply()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Boosting",
      NotificationManager.IMPORTANCE_HIGH
    )
    channel.description = "Boosting status"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun ensureWakeLock() {
    val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    if (wakeLock?.isHeld == true) return
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "gexup:boost-service"
    ).apply {
      setReferenceCounted(false)
      acquire(10 * 60 * 1000L)
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Exception) {
    } finally {
      wakeLock = null
    }
  }

  private fun buildNotification(gameName: String): Notification {
    val elapsed = if (startTime == 0L) 0 else (System.currentTimeMillis() - startTime) / 1000
    val hours = elapsed / 3600
    val minutes = (elapsed % 3600) / 60
    val seconds = elapsed % 60
    val timeLabel = String.format("%02d:%02d:%02d", hours, minutes, seconds)
    val pingLabel = if (currentPing >= 0) "${currentPing}ms" else "-"
    val serverLabel = if (currentServerName.isNotBlank()) currentServerName else "-"
    val content = "$gameName · $timeLabel\nServer: $serverLabel · Ping: $pingLabel"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("GeXuP boosting")
      .setContentText(content)
      .setStyle(NotificationCompat.BigTextStyle().bigText(content))
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  private fun updateNotification() {
    ensureWakeLock()
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(NOTIFICATION_ID, buildNotification(currentGameName))
  }

  companion object {
    const val ACTION_STOP = "com.gexup.action.STOP_BOOST"
    const val CHANNEL_ID = "boost_status"
    const val NOTIFICATION_ID = 1001
    const val EXTRA_GAME_NAME = "extra_game_name"
    const val EXTRA_GAME_PACKAGE = "extra_game_package"
    const val EXTRA_SERVER_NAME = "extra_server_name"
    const val EXTRA_PING = "extra_ping"
    const val PREFS_NAME = "boost_service"
    const val PREF_START_TIME = "start_time"
    const val PREF_GAME_NAME = "game_name"
    const val PREF_GAME_PACKAGE = "game_package"
    const val PREF_SERVER_NAME = "server_name"
    const val PREF_PING = "ping"
    const val PREF_ACTIVE = "active"
  }
}
