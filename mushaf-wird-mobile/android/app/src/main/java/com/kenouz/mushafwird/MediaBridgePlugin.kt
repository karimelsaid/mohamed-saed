package com.kenouz.mushafwird

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.content.Intent
import android.os.Build

@CapacitorPlugin(name = "MediaBridge")
class MediaBridgePlugin : Plugin() {

    companion object {
        @Volatile
        var instance: MediaBridgePlugin? = null
    }

    override fun load() {
        super.load()
        instance = this
    }

    fun notifyPlaybackEnded() {
        val data = JSObject()
        data.put("status", "ended")
        notifyListeners("playbackEnded", data)
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("URL is required")
            return
        }
        val title = call.getString("title") ?: "تلاوة القرآن"
        val artist = call.getString("artist") ?: "كنوز"

        android.util.Log.d("MediaBridge", "Play called for: $url")
        
        // Visual confirmation for the user during testing
        activity?.runOnUiThread {
            android.widget.Toast.makeText(context, "بدء التشغيل الأصلي: $title", android.widget.Toast.LENGTH_SHORT).show()
        }

        // Start/Confirm the service is running
        val context = activity ?: context
        val intent = Intent(context, MediaPlaybackService::class.java)
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            android.util.Log.e("MediaBridge", "FAILED to start service: ${e.message}")
            call.reject("Failed to start service: ${e.message}")
            return
        }

        // Wait for service instance to be ready
        var attempts = 0
        val maxAttempts = 3
        
        fun tryPlay() {
            val service = MediaPlaybackService.instance
            if (service != null) {
                android.util.Log.d("MediaBridge", "Service instance ready, sending playUrl")
                service.playUrl(url, title, artist)
                call.resolve()
            } else if (attempts < maxAttempts) {
                attempts++
                android.util.Log.w("MediaBridge", "Service not ready (attempt $attempts), retrying in 400ms...")
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    tryPlay()
                }, 400)
            } else {
                android.util.Log.e("MediaBridge", "CRITICAL: Service failed to initialize after multiple attempts")
                call.reject("Service initialization timeout")
            }
        }

        activity?.runOnUiThread {
            tryPlay()
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        activity?.runOnUiThread {
            MediaPlaybackService.instance?.pausePlayback()
            call.resolve()
        }
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        activity?.runOnUiThread {
            MediaPlaybackService.instance?.resumePlayback()
            call.resolve()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity?.runOnUiThread {
            MediaPlaybackService.instance?.stopPlayback()
            
            // Stop the service completely
            val context = activity ?: context
            val intent = Intent(context, MediaPlaybackService::class.java)
            context.stopService(intent)
            
            call.resolve()
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        activity?.runOnUiThread {
            val service = MediaPlaybackService.instance
            val result = JSObject()
            result.put("isPlaying", service?.isPlaying() == true)
            result.put("position", service?.getCurrentPosition() ?: 0)
            result.put("duration", service?.getDuration() ?: 0)
            call.resolve(result)
        }
    }
}
