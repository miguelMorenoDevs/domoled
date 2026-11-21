package com.domo.led.player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import com.domo.led.Librespot
import com.domo.led.connect.SpotifyConnect

/**
 * Owns the Connect session and its audio focus for the process. The session runs only while the
 * app is in front and no dream is up. Leaving the app or starting the dream pauses playback,
 * releases focus and drops the session; returning reconnects and resumes only if it was playing.
 */
object PlayerHolder {
    private var appActive = false
    private var dreaming = false
    private var connect: SpotifyConnect? = null
    private var listener: SpotifyConnect.Listener? = null
    private var focus: AudioFocusRequest? = null
    private var resumeWanted = false

    @Synchronized
    fun appStarted(context: Context, listener: SpotifyConnect.Listener) {
        appActive = true
        this.listener = listener
        reconcile(context)
    }

    @Synchronized
    fun appStopped(context: Context) {
        appActive = false
        listener = null
        reconcile(context)
    }

    @Synchronized
    fun dreamStarted(context: Context) {
        dreaming = true
        reconcile(context)
    }

    @Synchronized
    fun dreamStopped(context: Context) {
        dreaming = false
        reconcile(context)
    }

    private fun reconcile(context: Context) {
        if (appActive && !dreaming) start(context) else stop(context)
    }

    private fun start(context: Context) {
        if (connect != null) return
        val observer = listener ?: return
        connect = SpotifyConnect.fromAssets(context.assets, object : SpotifyConnect.Listener {
            override fun onFailure(message: String) = observer.onFailure(message)

            override fun onConnected() {
                sessionUp(context)
                observer.onConnected()
            }
        })?.also { it.start() }
    }

    private fun stop(context: Context) {
        pauseForLeave()
        abandonFocus(context)
        connect?.stop()
        connect = null
    }

    @Synchronized
    private fun sessionUp(context: Context) {
        if (connect != null && requestFocus(context)) resumeIfWanted()
    }

    @Synchronized
    private fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> resumeIfWanted()
            AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                if (Librespot.isPlaying()) {
                    Librespot.control(Librespot.ACTION_PAUSE)
                    resumeWanted = true
                }
            }
        }
    }

    private fun pauseForLeave() {
        if (!Librespot.isPlaying()) return
        Librespot.control(Librespot.ACTION_PAUSE)
        resumeWanted = true
    }

    private fun resumeIfWanted() {
        if (!resumeWanted) return
        resumeWanted = false
        Librespot.control(Librespot.ACTION_PLAY)
    }

    private fun requestFocus(context: Context): Boolean {
        if (focus != null) return true
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setOnAudioFocusChangeListener { onFocusChange(it) }
            .build()
        val manager = context.getSystemService(AudioManager::class.java)
        if (manager.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
        focus = request
        return true
    }

    private fun abandonFocus(context: Context) {
        val request = focus ?: return
        context.getSystemService(AudioManager::class.java).abandonAudioFocusRequest(request)
        focus = null
    }
}
