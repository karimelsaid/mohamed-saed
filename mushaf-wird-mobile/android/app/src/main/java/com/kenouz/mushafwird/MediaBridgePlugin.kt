package com.kenouz.mushafwird

import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
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

    // NEW: Notify JS when native player auto-advances to next verse
    fun notifyVerseChanged(verseKey: String) {
        val data = JSObject()
        data.put("verseKey", verseKey)
        notifyListeners("verseChanged", data)
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("URL is required")
            return
        }
        val title = call.getString("title") ?: "تلاوة القرآن"
        val artist = call.getString("artist") ?: "كنوز"
        val startPositionMs = call.getLong("startPositionMs") ?: 0L
        val clippingStartMs = call.getLong("clippingStartMs") ?: -1L // -1L as sentinel for UNSET
        val clippingEndMs = call.getLong("clippingEndMs") ?: -1L

        android.util.Log.d("MediaBridge", "Play called for: $url at $startPositionMs (Clipped: $clippingStartMs - $clippingEndMs)")

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
                service.playUrl(url, title, artist, startPositionMs, clippingStartMs, clippingEndMs)
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

    // NEW: Set a queue of verses for native background playback
    @PluginMethod
    fun setQueue(call: PluginCall) {
        val itemsArray = call.getArray("items")
        val startIndex = call.getInt("startIndex", 0) ?: 0
        val startPositionMs = call.getLong("startPositionMs") ?: 0L

        if (itemsArray == null || itemsArray.length() == 0) {
            call.reject("Items array is required")
            return
        }

        android.util.Log.d("MediaBridge", "setQueue called with ${itemsArray.length()} items, startIndex=$startIndex")

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

        // Parse items into QueueItems
        val queueItems = mutableListOf<MediaPlaybackService.QueueItem>()
        for (i in 0 until itemsArray.length()) {
            val item = itemsArray.getJSONObject(i)
            queueItems.add(
                MediaPlaybackService.QueueItem(
                    url = item.getString("url") ?: "",
                    title = item.getString("title") ?: "",
                    artist = item.getString("artist") ?: "",
                    verseKey = item.getString("verseKey") ?: "",
                    startPositionMs = if (i == startIndex) startPositionMs else 0L,
                    clippingStartMs = item.getLong("clippingStartMs") ?: -1L,
                    clippingEndMs = item.getLong("clippingEndMs") ?: -1L
                )
            )
        }

        var attempts = 0
        val maxAttempts = 3

        fun trySetQueue() {
            val service = MediaPlaybackService.instance
            if (service != null) {
                android.util.Log.d("MediaBridge", "Service ready, setting queue at index $startIndex position $startPositionMs")
                service.setQueue(queueItems, startIndex, startPositionMs)
                call.resolve()
            } else if (attempts < maxAttempts) {
                attempts++
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    trySetQueue()
                }, 400)
            } else {
                call.reject("Service initialization timeout")
            }
        }

        activity?.runOnUiThread {
            trySetQueue()
        }
    }

    // NEW: Add a single item to the queue
    @PluginMethod
    fun addToQueue(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("URL is required")
            return
        }
        val title = call.getString("title") ?: "تلاوة القرآن"
        val artist = call.getString("artist") ?: "كنوز"
        val verseKey = call.getString("verseKey") ?: ""

        val clippingStartMs = call.getLong("clippingStartMs") ?: -1L
        val clippingEndMs = call.getLong("clippingEndMs") ?: -1L

        activity?.runOnUiThread {
            val service = MediaPlaybackService.instance
            if (service != null) {
                service.addToQueue(
                    MediaPlaybackService.QueueItem(url, title, artist, verseKey, 0, clippingStartMs, clippingEndMs)
                )
                call.resolve()
            } else {
                call.reject("Service not running")
            }
        }
    }

    // NEW: Clear the queue
    @PluginMethod
    fun clearQueue(call: PluginCall) {
        activity?.runOnUiThread {
            MediaPlaybackService.instance?.clearQueue()
            call.resolve()
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
    fun seekTo(call: PluginCall) {
        val position = call.getDouble("position") ?: 0.0
        val positionMs = (position * 1000).toLong()

        activity?.runOnUiThread {
            MediaPlaybackService.instance?.seekTo(positionMs)
            call.resolve()
        }
    }

    @PluginMethod
    fun setRate(call: PluginCall) {
        val rate = call.getDouble("rate")?.toFloat() ?: 1.0f

        var attempts = 0
        val maxAttempts = 3

        fun trySetRate() {
            val service = MediaPlaybackService.instance
            if (service != null) {
                service.setPlaybackSpeed(rate)
                call.resolve()
            } else if (attempts < maxAttempts) {
                attempts++
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    trySetRate()
                }, 400)
            } else {
                call.reject("Service not ready")
            }
        }

        activity?.runOnUiThread {
            trySetRate()
        }
    }

    @PluginMethod
    fun setSleepTimer(call: PluginCall) {
        val minutes = call.getInt("minutes") ?: 0
        activity?.runOnUiThread {
            MediaPlaybackService.instance?.setSleepTimer(minutes)
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
            result.put("queueSize", service?.getQueueSize() ?: 0)
            result.put("queueIndex", service?.getQueueIndex() ?: 0)
            result.put("currentVerseKey", service?.getCurrentVerseKey() ?: "")
            call.resolve(result)
        }
    }
}
