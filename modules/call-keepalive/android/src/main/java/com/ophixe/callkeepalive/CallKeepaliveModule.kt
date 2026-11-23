package com.ophixe.callkeepalive

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallKeepaliveModule : Module() {
  private fun serviceIntent(): Intent? {
    val context: Context =
      appContext.reactContext?.applicationContext ?: return null
    return Intent(context, CallKeepaliveService::class.java)
  }

  override fun definition() = ModuleDefinition {
    Name("CallKeepalive")

    Function("start") {
      val context = appContext.reactContext?.applicationContext
        ?: return@Function null
      val intent = serviceIntent() ?: return@Function null
      ContextCompat.startForegroundService(context, intent)
      return@Function null
    }

    Function("stop") {
      val context = appContext.reactContext?.applicationContext
        ?: return@Function null
      val intent = serviceIntent() ?: return@Function null
      context.stopService(intent)
      return@Function null
    }
  }
}
