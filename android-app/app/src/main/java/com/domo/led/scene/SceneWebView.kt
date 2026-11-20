package com.domo.led.scene

import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler

const val SCENE_URL = "http://appassets.androidplatform.net/assets/index.html"

// http, not https: the Pi serves plain HTTP, and an https page would make those requests mixed content.
fun createSceneWebView(context: Context, url: String): WebView {
    val assets = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", AssetsPathHandler(context))
        .build()

    val view = WebView(context).apply {
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
    if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
        WebView.setWebContentsDebuggingEnabled(true)
    }

    view.loadUrl(url)
    return view
}
