package com.domo.led

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Toast
import com.domo.led.scene.SCENE_URL
import com.domo.led.scene.createSceneWebView

class LedActivity : Activity() {
    private var webView: WebView? = null
    private val passive by lazy { intent.getBooleanExtra(EXTRA_PASSIVE, false) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No insets controller here: on API 30 getInsetsController() touches the DecorView, which
        // does not exist yet, and throws. The fullscreen theme plus this flag is enough on a TV.
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        if (passive) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val url = if (passive) "$SCENE_URL?passive=1" else SCENE_URL
        val view = createSceneWebView(this, url)
        webView = view
        setContentView(view)
        // The dream never touches the player; the app reports which librespot it ships.
        if (!passive) reportNativeLibrary()
    }

    // The error card belongs to the server state stream, which would overwrite it on the next
    // event, so a packaging failure gets a toast and a log line instead.
    private fun reportNativeLibrary() {
        val version = Librespot.version
        if (version != null) {
            Log.i("Librespot", "native $version")
            return
        }
        Toast.makeText(this, "Native player unavailable", Toast.LENGTH_LONG).show()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (passive && event.action == KeyEvent.ACTION_DOWN) {
            finish()
            return true
        }
        return super.dispatchKeyEvent(event)
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
