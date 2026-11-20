package com.domo.led.dream

import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.service.dreams.DreamService
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

class LedDreamService : DreamService() {
    private var webView: WebView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        setFullscreen(true)
        setInteractive(false)

        // http, not https: the Pi serves plain HTTP, and an https page would make those requests mixed content.
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        val view = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assets.shouldInterceptRequest(request.url)
            }
        }
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = view
        setContentView(view)
        view.loadUrl("http://appassets.androidplatform.net/assets/index.html")
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        webView?.resumeTimers()
        webView?.onResume()
    }

    override fun onDreamingStopped() {
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
