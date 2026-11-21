package com.domo.led.dream

import android.service.dreams.DreamService
import android.webkit.WebView
import com.domo.led.player.PlayerHolder
import com.domo.led.scene.SCENE_URL
import com.domo.led.scene.createSceneWebView

class LedDreamService : DreamService() {
    private var webView: WebView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        setFullscreen(true)
        setInteractive(false)

        val view = createSceneWebView(this, "$SCENE_URL?passive=1")
        webView = view
        setContentView(view)
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        PlayerHolder.dreamStarted(applicationContext)
        webView?.resumeTimers()
        webView?.onResume()
    }

    override fun onDreamingStopped() {
        PlayerHolder.dreamStopped(applicationContext)
        webView?.pauseTimers()
        webView?.onPause()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        webView?.destroy()
        webView = null
        super.onDetachedFromWindow()
    }
}
