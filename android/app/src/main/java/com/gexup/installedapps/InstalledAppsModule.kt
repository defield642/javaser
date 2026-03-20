package com.gexup.installedapps

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.Base64
import android.provider.Settings
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.PowerManager
import java.io.File
import java.io.FileOutputStream
import android.content.Intent
import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.gexup.boost.BoostService
import com.gexup.vpn.GexupVpnService
import android.net.VpnService
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import android.util.Log

class InstalledAppsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "InstalledApps"

  @ReactMethod
  fun getInstalledGames(promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
      val result = Arguments.createArray()

      for (app in apps) {
        val launchIntent = pm.getLaunchIntentForPackage(app.packageName)
        if (launchIntent == null) continue
        if ((app.flags and ApplicationInfo.FLAG_SYSTEM) != 0) continue

        val isGame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          app.category == ApplicationInfo.CATEGORY_GAME || (app.flags and ApplicationInfo.FLAG_IS_GAME) != 0
        } else {
          (app.flags and ApplicationInfo.FLAG_IS_GAME) != 0
        }

        if (!isGame) continue

        val map = Arguments.createMap()
        map.putString("packageName", app.packageName)
        map.putString("name", pm.getApplicationLabel(app).toString())
        map.putBoolean("isGame", isGame)

        val icon = pm.getApplicationIcon(app)
        val iconBase64 = drawableToBase64(icon)
        if (iconBase64 != null) {
          map.putString("icon", iconBase64)
        }

        result.pushMap(map)
      }

      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("INSTALLED_APPS_ERROR", e)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val intent = pm.getLaunchIntentForPackage(packageName)
      if (intent == null) {
        promise.reject("LAUNCH_ERROR", "No launch intent for $packageName")
        return
      }
      intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      UiThreadUtil.runOnUiThread {
        reactApplicationContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LAUNCH_ERROR", e)
    }
  }

  @ReactMethod
  fun startBoostService(gameName: String, gamePackage: String, serverName: String, ping: Int, promise: Promise) {
    try {
      // Sanitize all string values before passing to intent
      val safeGameName = gameName.replace("\n", " ").replace("\r", " ").trim()
      val safeGamePackage = gamePackage.replace("\n", " ").replace("\r", " ").trim()
      val safeServerName = serverName.replace("\n", " ").replace("\r", " ").trim()
      val intent = Intent(reactApplicationContext, BoostService::class.java)
      intent.putExtra(BoostService.EXTRA_GAME_NAME, safeGameName)
      intent.putExtra(BoostService.EXTRA_GAME_PACKAGE, safeGamePackage)
      intent.putExtra(BoostService.EXTRA_SERVER_NAME, safeServerName)
      intent.putExtra(BoostService.EXTRA_PING, ping)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BOOST_SERVICE_START_ERROR", e)
    }
  }

  @ReactMethod
  fun stopBoostService(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, BoostService::class.java)
      intent.action = BoostService.ACTION_STOP
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BOOST_SERVICE_STOP_ERROR", e)
    }
  }

  @ReactMethod
  fun getBoostState(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        BoostService.PREFS_NAME,
        Context.MODE_PRIVATE
      )
      val active = prefs.getBoolean(BoostService.PREF_ACTIVE, false)
      val gameName = prefs.getString(BoostService.PREF_GAME_NAME, "") ?: ""
      val gamePackage = prefs.getString(BoostService.PREF_GAME_PACKAGE, "") ?: ""
      val serverName = prefs.getString(BoostService.PREF_SERVER_NAME, "") ?: ""
      val startTime = prefs.getLong(BoostService.PREF_START_TIME, 0L)

      val map = Arguments.createMap()
      map.putBoolean("active", active)
      map.putString("gameName", gameName)
      map.putString("packageName", gamePackage)
      map.putString("serverName", serverName)
      map.putDouble("startTime", startTime.toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("BOOST_STATE_ERROR", e)
    }
  }

  @ReactMethod
  fun clearBoostState(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        BoostService.PREFS_NAME,
        Context.MODE_PRIVATE
      )
      prefs.edit().clear().apply()
      val intent = Intent(reactApplicationContext, BoostService::class.java)
      reactApplicationContext.stopService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BOOST_STATE_CLEAR_ERROR", e)
    }
  }

  @ReactMethod
  fun prepareVpn(promise: Promise) {
    try {
      val intent = VpnService.prepare(reactApplicationContext)
      if (intent == null) {
        promise.resolve(true)
        return
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("VPN_PREPARE_ERROR", e)
    }
  }

  @ReactMethod
  fun startVpnService(gameName: String, promise: Promise) {
    startVpnRelayService(gameName, "", 443.0, "/relay/socket", "", promise)
  }

  @ReactMethod
  fun startVpnRelayService(
    gameName: String,
    relayHost: String,
    relayPort: Double,
    relayPath: String,
    relayToken: String,
    promise: Promise
  ) {
    try {
      val intent = Intent(reactApplicationContext, GexupVpnService::class.java)
      intent.putExtra(GexupVpnService.EXTRA_GAME_NAME, gameName)
      intent.putExtra(GexupVpnService.EXTRA_RELAY_HOST, relayHost.trim())
      intent.putExtra(GexupVpnService.EXTRA_RELAY_PORT, relayPort.toInt().coerceIn(1, 65535))
      intent.putExtra(GexupVpnService.EXTRA_RELAY_PATH, relayPath.trim())
      intent.putExtra(GexupVpnService.EXTRA_RELAY_TOKEN, relayToken.trim())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VPN_START_ERROR", e)
    }
  }

  @ReactMethod
  fun stopVpnService(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, GexupVpnService::class.java)
      reactApplicationContext.stopService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VPN_STOP_ERROR", e)
    }
  }

  @ReactMethod
  fun getVpnState(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        GexupVpnService.PREFS_NAME,
        Context.MODE_PRIVATE
      )
      val map = Arguments.createMap()
      map.putBoolean("active", prefs.getBoolean(GexupVpnService.PREF_ACTIVE, false))
      map.putDouble("startTime", prefs.getLong(GexupVpnService.PREF_START_TIME, 0L).toDouble())
      map.putString("gameName", prefs.getString(GexupVpnService.PREF_GAME_NAME, "") ?: "")
      map.putString("relayHost", prefs.getString(GexupVpnService.PREF_RELAY_HOST, "") ?: "")
      map.putInt("relayPort", prefs.getInt(GexupVpnService.PREF_RELAY_PORT, 0))
      map.putString("relayPath", prefs.getString(GexupVpnService.PREF_RELAY_PATH, "") ?: "")
      map.putBoolean("relayConnected", prefs.getBoolean(GexupVpnService.PREF_RELAY_CONNECTED, false))
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("VPN_STATE_ERROR", e)
    }
  }

  @ReactMethod
  fun openDataSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_DATA_USAGE_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      try {
        val intent = Intent(Settings.ACTION_WIRELESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
        promise.resolve(true)
      } catch (inner: Exception) {
        try {
          val intent = Intent(Settings.ACTION_SETTINGS)
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          reactApplicationContext.startActivity(intent)
          promise.resolve(true)
        } catch (fallback: Exception) {
          promise.reject("OPEN_DATA_SETTINGS_ERROR", fallback)
        }
      }
    }
  }

  @ReactMethod
  fun setMediaVolume(level: Double, promise: Promise) {
    try {
      val audio = reactApplicationContext.getSystemService(AudioManager::class.java)
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      val clamped = when {
        level.isNaN() -> 0.5
        level < 0.0 -> 0.0
        level > 1.0 -> 1.0
        else -> level
      }
      val target = (clamped * max).toInt().coerceIn(0, max)
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SET_VOLUME_ERROR", e)
    }
  }

  @ReactMethod
  fun pingUrl(url: String, timeoutMs: Double, promise: Promise) {
    thread {
      var connection: HttpURLConnection? = null
      try {
        val timeout = timeoutMs.toInt().coerceIn(500, 10000)
        val startedAt = System.currentTimeMillis()
        val separator = if (url.contains("?")) "&" else "?"
        val targetUrl = URL(url + separator + "_t=" + startedAt)
        connection = (targetUrl.openConnection() as HttpURLConnection).apply {
          requestMethod = "GET"
          connectTimeout = timeout
          readTimeout = timeout
          useCaches = false
          instanceFollowRedirects = true
          setRequestProperty("Cache-Control", "no-cache")
        }
        connection.connect()
        val code = connection.responseCode
        Log.d("InstalledAppsModule", "pingUrl url=$url code=$code")
        if (code in 100..599) {
          val elapsed = System.currentTimeMillis() - startedAt
          promise.resolve(elapsed.toDouble())
        } else {
          promise.reject("PING_URL_ERROR", "HTTP $code")
        }
      } catch (e: Exception) {
        Log.e("InstalledAppsModule", "pingUrl failed for $url", e)
        promise.reject("PING_URL_ERROR", e)
      } finally {
        connection?.disconnect()
      }
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
    } catch (e: Exception) {
      promise.reject("BATTERY_OPTIMIZATION_STATUS_ERROR", e)
    }
  }

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:" + reactApplicationContext.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
        promise.resolve(true)
        return
      }

      val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(fallbackIntent)
      promise.resolve(true)
    } catch (e: Exception) {
      try {
        val fallbackIntent = Intent(Settings.ACTION_SETTINGS)
        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(fallbackIntent)
        promise.resolve(true)
      } catch (fallback: Exception) {
        promise.reject("OPEN_BATTERY_OPTIMIZATION_ERROR", fallback)
      }
    }
  }

  @ReactMethod
  fun writeErrorLog(message: String, promise: Promise) {
    try {
      val file = File(reactApplicationContext.filesDir, "gexup_errors.txt")
      val out = FileOutputStream(file, true)
      out.write((message + "\n").toByteArray())
      out.flush()
      out.close()
      promise.resolve(file.absolutePath)
    } catch (e: Exception) {
      promise.reject("WRITE_LOG_ERROR", e)
    }
  }

  @ReactMethod
  fun shareErrorLog(promise: Promise) {
    try {
      val file = File(reactApplicationContext.filesDir, "gexup_errors.txt")
      if (!file.exists()) {
        promise.reject("SHARE_LOG_ERROR", "No log file found")
        return
      }
      val uri: Uri = FileProvider.getUriForFile(
        reactApplicationContext,
        reactApplicationContext.packageName + ".provider",
        file
      )
      val shareIntent = Intent(Intent.ACTION_SEND)
      shareIntent.type = "text/plain"
      shareIntent.putExtra(Intent.EXTRA_STREAM, uri)
      shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val chooser = Intent.createChooser(shareIntent, "Share logs")
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHARE_LOG_ERROR", e)
    }
  }

  @ReactMethod
  fun playGoodSound(promise: Promise) {
    try {
      val player = MediaPlayer.create(reactApplicationContext, com.gexup.R.raw.good_ping)
      player.setOnCompletionListener { it.release() }
      player.start()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PLAY_SOUND_ERROR", e)
    }
  }

  @ReactMethod
  fun playBadSound(promise: Promise) {
    try {
      val player = MediaPlayer.create(reactApplicationContext, com.gexup.R.raw.bad_ping)
      player.setOnCompletionListener { it.release() }
      player.start()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PLAY_SOUND_ERROR", e)
    }
  }

  private fun drawableToBase64(drawable: Drawable): String? {
    val bitmap = when (drawable) {
      is BitmapDrawable -> drawable.bitmap
      else -> {
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        bitmap
      }
    }

    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
  }
}
