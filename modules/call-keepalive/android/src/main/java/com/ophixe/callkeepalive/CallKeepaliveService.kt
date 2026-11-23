package com.ophixe.callkeepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Microphone-type foreground service: while it runs, Android keeps the
 * app's audio (and the Agora socket) alive when the call screen is
 * minimized. Started on channel join, stopped on every leave path.
 */
class CallKeepaliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Ongoing calls",
        NotificationManager.IMPORTANCE_LOW,
      )
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

  private fun buildNotification(): Notification {
    var icon = applicationContext.resources.getIdentifier(
      "notification_icon",
      "drawable",
      applicationContext.packageName,
    )
    if (icon == 0) {
      icon = android.R.drawable.ic_menu_call
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Ophixe call in progress")
      .setContentText("Tap to return to your call.")
      .setSmallIcon(icon)
      .setOngoing(true)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) {
      builder.setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    }
    return builder.build()
  }

  companion object {
    private const val CHANNEL_ID = "ophixe-call"
    private const val NOTIFICATION_ID = 2001
  }
}
