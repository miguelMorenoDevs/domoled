package com.domo.led

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import com.domo.led.connect.SpotifyConnect
import com.domo.led.player.PlayerHolder
import com.domo.led.scene.SCENE_URL
import com.domo.led.scene.createSceneWebView

class LedActivity : Activity() {
    private var webView: WebView? = null
    private val passive by lazy { intent.getBooleanExtra(EXTRA_PASSIVE, false) }
    // Only touched on the UI thread. The listener runs on the holder thread and hops over.
    private var playerError: String? = null
    private var pageReady = false
    private val connectListener = object : SpotifyConnect.Listener {
        override fun onFailure(message: String) {
            runOnUiThread {
                playerError = message
                sendPlayerState()
            }
        }

        override fun onConnected() {
            runOnUiThread {
                playerError = null
                sendPlayerState()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No insets controller here: on API 30 getInsetsController() touches the DecorView, which
        // does not exist yet, and throws. The fullscreen theme plus this flag is enough on a TV.
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        if (passive) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val url = if (passive) "$SCENE_URL?passive=1" else SCENE_URL
        val view = createSceneWebView(this, url) {
            pageReady = true
            sendPlayerState()
        }
        webView = view
        setContentView(view)
        // The dream never touches the player; the app reports which librespot it ships.
        if (!passive) reportNativeLibrary()
    }

    // The Connect device is listed only while the app is open; the dream never starts it.
    override fun onStart() {
        super.onStart()
        if (!passive) PlayerHolder.appStarted(applicationContext, connectListener)
    }

    override fun onStop() {
        if (!passive) PlayerHolder.appStopped(applicationContext)
        super.onStop()
    }

    // Evaluating before the page loads would reach the outgoing document, so it waits for onReady.
    private fun sendPlayerState() {
        if (!pageReady) return
        val script = playerError?.let { "window.showPlayerError(${org.json.JSONObject.quote(it)})" }
            ?: "window.clearPlayerError()"
        webView?.evaluateJavascript(script, null)
    }

    private fun reportNativeLibrary() {
        val version = Librespot.version ?: return
        Log.i("Librespot", "native $version")
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (passive && event.action == KeyEvent.ACTION_DOWN) {
            finish()
            return true
        }
        if (!passive && event.action == KeyEvent.ACTION_DOWN) {
            mediaAction(event.keyCode)?.let {
                Librespot.control(it)
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun mediaAction(keyCode: Int): Int? = when (keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> Librespot.ACTION_PLAY_PAUSE
        KeyEvent.KEYCODE_MEDIA_PLAY -> Librespot.ACTION_PLAY
        KeyEvent.KEYCODE_MEDIA_PAUSE -> Librespot.ACTION_PAUSE
        KeyEvent.KEYCODE_MEDIA_NEXT -> Librespot.ACTION_NEXT
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> Librespot.ACTION_PREVIOUS
        else -> null
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PASSIVE = "passive"
    }
}
