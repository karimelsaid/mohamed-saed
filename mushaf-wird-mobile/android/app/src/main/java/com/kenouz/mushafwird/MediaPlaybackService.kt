@file:OptIn(androidx.media3.common.util.UnstableApi::class)
package com.kenouz.mushafwird


import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
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
        android.util.Log.i("MediaPlaybackService", "Service onCreate - Version 1.5.1 stability fix")
        instance = this

        createNotificationChannel()

        try {
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
                    android.util.Log.d("MediaPlaybackService", "Playback state changed: $playbackState")
                    if (playbackState == Player.STATE_ENDED) {
                        onPlaybackCompleted()
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    android.util.Log.e("MediaPlaybackService", "ExoPlayer Error: ${error.errorCodeName} (Code: ${error.errorCode}) - ${error.message}")
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

    // Public methods called from Capacitor Plugin
    fun playUrl(url: String, title: String, artist: String) {
        android.util.Log.i("MediaPlaybackService", "playUrl Action: $title")
        val p = player ?: run {
            android.util.Log.e("MediaPlaybackService", "Cannot play: player is null")
            return
        }

        try {
            p.stop()
            p.clearMediaItems()

            val mediaItem = MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setDisplayTitle(title)
                        .setAlbumTitle("كنوز")
                        .build()
                )
                .build()

            p.setMediaItem(mediaItem)
            p.prepare()
            p.play()

            // Update/Keep foreground with specific metadata
            val notification = buildSimpleNotification(title, artist)
            startForeground(NOTIFICATION_ID, notification)

            android.util.Log.d("MediaPlaybackService", "play() command executed and foreground updated")
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

    fun stopPlayback() {
        android.util.Log.i("MediaPlaybackService", "stopPlayback - remove foreground")
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

    fun isPlaying(): Boolean = player?.isPlaying ?: false
    fun getCurrentPosition(): Long = player?.currentPosition ?: 0
    fun getDuration(): Long = player?.duration ?: 0

    private fun onPlaybackCompleted() {
        android.util.Log.d("MediaPlaybackService", "Verse ended - notifying plugin")
        MediaBridgePlugin.instance?.notifyPlaybackEnded()
    }

    private inner class MediaSessionCallback : MediaSession.Callback {
        // standard media controls are handled by Media3
    }
}
