package com.domo.led.connect

import android.content.res.AssetManager
import android.util.Log
import com.domo.led.Librespot
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Keeps the TV registered as a Spotify Connect device while the app is open. The server hands out
 * a short-lived access token for the active user; the native session logs in with it and keeps
 * its own connection. When the session drops, the loop fetches a fresh token and starts again.
 */
class SpotifyConnect private constructor(
    private val serverUrl: String,
    private val tvToken: String,
    private val onStatus: (String) -> Unit,
) {
    @Volatile private var running = false
    private var worker: Thread? = null

    fun start() {
        if (worker != null) return
        running = true
        worker = Thread(::run, "spotify-connect").apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        running = false
        worker?.interrupt()
        worker = null
        if (Librespot.available) Librespot.nativeStop()
    }

    private fun run() {
        try {
            if (!Librespot.available) {
                onStatus("Native player unavailable")
                return
            }
            var backoffMs = MIN_BACKOFF_MS
            var lastReason: String? = null
            while (running) {
                try {
                    val token = fetchToken()
                    val error = Librespot.nativeStart(token, DEVICE_NAME)
                    if (error != null) throw Failure(error)
                    if (!running) return
                    backoffMs = MIN_BACKOFF_MS
                    lastReason = null
                    while (running && Librespot.nativeIsAlive()) Thread.sleep(POLL_MS)
                    Librespot.nativeStop()
                    if (running) Log.w(TAG, "Spotify Connect session dropped, reconnecting")
                    Thread.sleep(MIN_BACKOFF_MS)
                } catch (failure: Failure) {
                    if (failure.reason != lastReason) {
                        lastReason = failure.reason
                        onStatus(failure.reason)
                    }
                    Thread.sleep(backoffMs)
                    backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS)
                }
            }
        } catch (interrupted: InterruptedException) {
            // stop() asked for it.
        } finally {
            Librespot.nativeStop()
        }
    }

    // The token is returned to the native layer only; it is never logged or reported.
    private fun fetchToken(): String {
        val connection = URL("$serverUrl/spotify/stream-token").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("X-TV-Token", tvToken)
            when (val status = connection.responseCode) {
                200 -> {}
                401 -> throw Failure("Spotify login expired. Log in again from the TV.")
                403 -> throw Failure("The server refused the TV token.")
                404 -> throw Failure("No Spotify user is active. Add one from the TV.")
                502 -> throw Failure("Spotify could not complete the request.")
                else -> throw Failure("The server answered with status $status.")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return JSONObject(body).getString("accessToken")
        } catch (error: IOException) {
            throw Failure("Could not reach the server.")
        } catch (error: org.json.JSONException) {
            throw Failure("The server sent an unreadable Spotify token.")
        } finally {
            connection.disconnect()
        }
    }

    private class Failure(val reason: String) : Exception(reason)

    companion object {
        /** The name the phone lists. Documented in docs/firetv.md. */
        const val DEVICE_NAME = "DomoLED TV"

        private const val TAG = "SpotifyConnect"
        private const val TIMEOUT_MS = 10_000
        private const val POLL_MS = 5_000L
        private const val MIN_BACKOFF_MS = 2_000L
        private const val MAX_BACKOFF_MS = 60_000L

        /** Reads the server address and TV token that copy-assets bakes into config.js. Null when they are missing. */
        fun fromAssets(assets: AssetManager, onStatus: (String) -> Unit): SpotifyConnect? {
            val config = try {
                assets.open("config.js").bufferedReader().use { it.readText() }
            } catch (error: IOException) {
                Log.e(TAG, "config.js missing from the assets", error)
                return null
            }
            val serverUrl = setting(config, "LED_SERVER_URL") ?: return null
            val tvToken = setting(config, "TV_TOKEN") ?: return null
            return SpotifyConnect(serverUrl, tvToken, onStatus)
        }

        private fun setting(config: String, name: String): String? =
            Regex("""$name\s*=\s*"([^"]+)"""").find(config)?.groupValues?.get(1)
    }
}
