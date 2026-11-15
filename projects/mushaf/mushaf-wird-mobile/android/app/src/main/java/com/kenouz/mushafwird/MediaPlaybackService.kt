@file:OptIn(androidx.media3.common.util.UnstableApi::class)
package com.kenouz.mushafwird


import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.Context
import android.media.AudioManager
import androidx.annotation.OptIn
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.*

class MediaPlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private var player: ExoPlayer? = null
    
    // Native Playlist Queue for seamless background transitions
    private val playlistQueue = mutableListOf<QueueItem>()
    private var currentQueueIndex = 0
    private var isQueueMode = false
    private var playbackSpeed = 1.0f
    
    // Sleep Timer
    private var sleepTimerHandler: Handler? = null
    private var sleepTimerRunnable: Runnable? = null
    
    data class QueueItem(
        val url: String,
        val title: String,
        val artist: String,
        val verseKey: String,
        val startPositionMs: Long = 0,
        val clippingStartMs: Long = C.TIME_UNSET,
        val clippingEndMs: Long = C.TIME_UNSET
    )

    companion object {
        const val CHANNEL_ID = "quran_playback_channel"
        const val NOTIFICATION_ID = 101

        // Singleton to access player from plugin
        @Volatile
        var instance: MediaPlaybackService? = null
            private set
    }

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        // Global Error Handler to catch crashes and log them
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            android.util.Log.e("MediaPlaybackService", "CRITICAL CRASH in thread ${thread.name}: ${throwable.message}")
            throwable.printStackTrace()
        }

        super.onCreate()
        android.util.Log.i("MediaPlaybackService", "Service onCreate - Version 2.0.0 with Native Queue")
        instance = this

        createNotificationChannel()

        try {
            // Ensure Audio Manager is in NORMAL mode for speaker playback
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL

            player = ExoPlayer.Builder(this)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .setUsage(C.USAGE_MEDIA)
                        .build(),
                    true // handleAudioFocus
                )
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build()

            player?.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    android.util.Log.d("MediaPlaybackService", "Playback state changed: $playbackState, queueMode=$isQueueMode, queueSize=${playlistQueue.size}, currentIndex=$currentQueueIndex")
                    
                    if (playbackState == Player.STATE_READY) {
                        // RE-APPLY SPEED: Ensure parameters are active when track becomes ready
                        android.util.Log.d("MediaPlaybackService", "Player READY - applying speed: $playbackSpeed")
                        val params = androidx.media3.common.PlaybackParameters(playbackSpeed)
                        player?.setPlaybackParameters(params)
                    }

                    if (playbackState == Player.STATE_ENDED) {
                        // If we are at the end of the playlist, notify JS
                        onPlaybackCompleted()
                    }
                }

                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    val p = player ?: return
                    val index = p.currentMediaItemIndex
                    android.util.Log.d("MediaPlaybackService", "Media item transition: index=$index, reason=$reason")
                    
                    if (index >= 0 && index < playlistQueue.size) {
                        currentQueueIndex = index
                        val item = playlistQueue[index]
                        
                        // Notify JS about the new verse being played
                        MediaBridgePlugin.instance?.notifyVerseChanged(item.verseKey)
                        
                        // Update foreground notification for the new item
                        val notification = buildSimpleNotification(item.title, item.artist)
                        startForeground(NOTIFICATION_ID, notification)
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    android.util.Log.e("MediaPlaybackService", "ExoPlayer Error: ${error.errorCodeName} (Code: ${error.errorCode}) - ${error.message}")
                    // On error, let ExoPlayer try to skip to next item if possible
                    if (player?.hasNextMediaItem() == true) {
                        player?.seekToNextMediaItem()
                    }
                }
            })

            val sessionActivityPendingIntent = PendingIntent.getActivity(
                this, 0,
                Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
                },
                PendingIntent.FLAG_IMMUTABLE
            )

            mediaSession = MediaSession.Builder(this, player!!)
                .setSessionActivity(sessionActivityPendingIntent)
                .setCallback(MediaSessionCallback())
                .build()

            android.util.Log.i("MediaPlaybackService", "MediaSession created successfully")
        } catch (e: Exception) {
            android.util.Log.e("MediaPlaybackService", "Failed to initialize Media3: ${e.message}")
            e.printStackTrace()
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        android.util.Log.i("MediaPlaybackService", "onStartCommand")
        // Start with a generic notification to satisfy the system immediately
        val notification = buildSimpleNotification("مصحف ورد", "جاري التحميل...")
        try {
            startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            android.util.Log.e("MediaPlaybackService", "Error starting foreground: ${e.message}")
        }
        return super.onStartCommand(intent, flags, startId)
    }

    private fun buildSimpleNotification(title: String, artist: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setAutoCancel(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    override fun onDestroy() {
        android.util.Log.i("MediaPlaybackService", "Service onDestroy")
        instance = null
        clearQueue()
        try {
            mediaSession?.run {
                player.release()
                release()
            }
        } catch (e: Exception) {
            android.util.Log.e("MediaPlaybackService", "Error in onDestroy: ${e.message}")
        }
        mediaSession = null
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Quran Recitation",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background audio playback for Mushaf Wird"
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    // ==================== QUEUE MANAGEMENT ====================
    
    /**
     * Set the playback queue with a list of verses
     * This allows native background transitions without JS
     */
    fun setQueue(items: List<QueueItem>, startIndex: Int = 0, startPositionMs: Long = 0) {
        android.util.Log.i("MediaPlaybackService", "setQueue: ${items.size} items, starting at index $startIndex, position ${startPositionMs}ms")
        val p = player ?: return
        
        isQueueMode = items.size > 1
        playlistQueue.clear()
        playlistQueue.addAll(items)
        currentQueueIndex = startIndex
        
        p.stop()
        p.clearMediaItems()
        
        val mediaItems = items.map { item ->
            val clippingConfig = MediaItem.ClippingConfiguration.Builder()
            if (item.clippingStartMs >= 0) clippingConfig.setStartPositionMs(item.clippingStartMs)
            if (item.clippingEndMs >= 0) clippingConfig.setEndPositionMs(item.clippingEndMs)

            MediaItem.Builder()
                .setUri(item.url)
                .setMediaId(item.verseKey)
                .setClippingConfiguration(clippingConfig.build())
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(item.title)
                        .setArtist(item.artist)
                        .setExtras(Bundle().apply { putString("verseKey", item.verseKey) })
                        .build()
                )
                .build()
        }
        
        p.setMediaItems(mediaItems, startIndex, startPositionMs)
        p.prepare()
        
        // Ensure playback speed is applied to the new playlist
        val params = androidx.media3.common.PlaybackParameters(playbackSpeed)
        p.setPlaybackParameters(params)
        
        // Re-enforce speaker mode
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_NORMAL
        
        p.play()
        
        // Update notification for initial item
        if (items.isNotEmpty() && startIndex < items.size) {
            val item = items[startIndex]
            val notification = buildSimpleNotification(item.title, item.artist)
            startForeground(NOTIFICATION_ID, notification)
        }
    }
    
    /**
     * Add an item to the end of the queue
     */
    fun addToQueue(item: QueueItem) {
        android.util.Log.d("MediaPlaybackService", "addToQueue: ${item.verseKey}")
        playlistQueue.add(item)
        if (!isQueueMode && playlistQueue.size > 1) {
            isQueueMode = true
        }
        
        val clippingConfig = MediaItem.ClippingConfiguration.Builder()
        if (item.clippingStartMs >= 0) clippingConfig.setStartPositionMs(item.clippingStartMs)
        if (item.clippingEndMs >= 0) clippingConfig.setEndPositionMs(item.clippingEndMs)

        val mediaItem = MediaItem.Builder()
            .setUri(item.url)
            .setMediaId(item.verseKey)
            .setClippingConfiguration(clippingConfig.build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(item.title)
                    .setArtist(item.artist)
                    .setExtras(Bundle().apply { putString("verseKey", item.verseKey) })
                    .build()
            )
            .build()
        player?.addMediaItem(mediaItem)
    }
    
    /**
     * Clear the queue
     */
    fun clearQueue() {
        android.util.Log.d("MediaPlaybackService", "clearQueue")
        playlistQueue.clear()
        currentQueueIndex = 0
        isQueueMode = false
    }
    
    /**
     * Get current verse key being played
     */
    fun getCurrentVerseKey(): String? {
        return if (playlistQueue.isNotEmpty() && currentQueueIndex < playlistQueue.size) {
            playlistQueue[currentQueueIndex].verseKey
        } else null
    }
    
    /**
     * Get queue size
     */
    fun getQueueSize(): Int = playlistQueue.size
    
    /**
     * Get current queue index
     */
    fun getQueueIndex(): Int = currentQueueIndex
    
    private fun playCurrentQueueItem() {
        if (playlistQueue.isEmpty() || currentQueueIndex >= playlistQueue.size) {
            android.util.Log.w("MediaPlaybackService", "playCurrentQueueItem: Queue empty or index out of bounds")
            return
        }
        
        val item = playlistQueue[currentQueueIndex]
        android.util.Log.i("MediaPlaybackService", "Playing queue item ${currentQueueIndex + 1}/${playlistQueue.size}: ${item.verseKey}")
        
        // Notify JS about which verse is now playing (for UI sync)
        MediaBridgePlugin.instance?.notifyVerseChanged(item.verseKey)
        
        playUrlInternal(item.url, item.title, item.artist, clippingStartMs = item.clippingStartMs, clippingEndMs = item.clippingEndMs)
    }

    // ==================== PLAYBACK METHODS ====================

    // Original single-play method (also used internally)
    fun playUrl(url: String, title: String, artist: String, startPositionMs: Long = 0, clippingStartMs: Long = C.TIME_UNSET, clippingEndMs: Long = C.TIME_UNSET) {
        android.util.Log.i("MediaPlaybackService", "playUrl (single): $title at $startPositionMs ms (Clipped: $clippingStartMs - $clippingEndMs)")
        
        // Clear queue for single play mode
        clearQueue()
        
        playUrlInternal(url, title, artist, startPositionMs, clippingStartMs, clippingEndMs)
    }
    
    private fun playUrlInternal(url: String, title: String, artist: String, startPositionMs: Long = 0, clippingStartMs: Long = C.TIME_UNSET, clippingEndMs: Long = C.TIME_UNSET) {
        val p = player ?: run {
            android.util.Log.e("MediaPlaybackService", "Cannot play: player is null")
            return
        }

        try {
            // Re-enforce speaker mode before every play call
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL
            
            p.stop()
            p.clearMediaItems()

            val clippingConfig = MediaItem.ClippingConfiguration.Builder()
            if (clippingStartMs != -1L) clippingConfig.setStartPositionMs(clippingStartMs)
            if (clippingEndMs != -1L) clippingConfig.setEndPositionMs(clippingEndMs)

            val mediaItem = MediaItem.Builder()
                .setUri(url)
                .setClippingConfiguration(clippingConfig.build())
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setDisplayTitle(title)
                        .setAlbumTitle("كنوز")
                        .build()
                )
                .build()

            p.setMediaItem(mediaItem, startPositionMs)
            
            // Re-apply current playback speed
            val params = androidx.media3.common.PlaybackParameters(playbackSpeed)
            p.setPlaybackParameters(params)
            
            p.play()

            // Update foreground notification
            val notification = buildSimpleNotification(title, artist)
            startForeground(NOTIFICATION_ID, notification)

            android.util.Log.d("MediaPlaybackService", "play() command executed")
        } catch (e: Exception) {
            android.util.Log.e("MediaPlaybackService", "Error during playUrl: ${e.message}")
        }
    }

    fun pausePlayback() {
        android.util.Log.d("MediaPlaybackService", "pausePlayback")
        player?.pause()
    }

    fun resumePlayback() {
        android.util.Log.d("MediaPlaybackService", "resumePlayback")
        player?.play()
    }

    fun seekTo(positionMs: Long) {
        android.util.Log.d("MediaPlaybackService", "seekTo: $positionMs ms")
        player?.seekTo(positionMs)
    }

    fun setPlaybackSpeed(speed: Float) {
        android.util.Log.d("MediaPlaybackService", "setPlaybackSpeed: $speed")
        playbackSpeed = speed
        val params = androidx.media3.common.PlaybackParameters(speed)
        player?.setPlaybackParameters(params)
    }

    fun setSleepTimer(minutes: Int) {
        cancelSleepTimer()
        if (minutes > 0) {
            val delayMs = minutes.toLong() * 60 * 1000
            sleepTimerHandler = Handler(Looper.getMainLooper())
            sleepTimerRunnable = Runnable {
                android.util.Log.i("MediaPlaybackService", "Sleep timer expired (${minutes}m) - stopping playback")
                stopPlayback()
            }
            sleepTimerHandler?.postDelayed(sleepTimerRunnable!!, delayMs)
            android.util.Log.i("MediaPlaybackService", "Native Sleep timer set for $minutes minutes")
        }
    }

    fun cancelSleepTimer() {
        sleepTimerRunnable?.let { sleepTimerHandler?.removeCallbacks(it) }
        sleepTimerRunnable = null
        sleepTimerHandler = null
    }

    fun stopPlayback() {
        android.util.Log.i("MediaPlaybackService", "stopPlayback - remove foreground")
        cancelSleepTimer()
        clearQueue()
        player?.stop()
        player?.clearMediaItems()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    fun isPlaying(): Boolean {
        val p = player ?: return false
        val state = p.playbackState
        // Return true if it's currently playing, OR if it's in a state where it's 
        // intended to be playing (READY/BUFFERING) and not paused.
        return p.playWhenReady && (state == Player.STATE_READY || state == Player.STATE_BUFFERING)
    }
    fun getCurrentPosition(): Long = player?.currentPosition ?: 0
    fun getDuration(): Long = player?.duration ?: 0

    private fun onPlaybackCompleted() {
        android.util.Log.d("MediaPlaybackService", "Playback ended - notifying plugin (queue exhausted or single mode)")
        MediaBridgePlugin.instance?.notifyPlaybackEnded()
    }

    private inner class MediaSessionCallback : MediaSession.Callback {
        // standard media controls are handled by Media3
    }
}
