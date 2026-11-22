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
    private val listener: Listener,
) {
    /** Called from the holder thread. A failure is reported once per reason; connected once per recovery. */
    interface Listener {
        fun onFailure(message: String)
        fun onConnected()
    }

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
        Librespot.stop()
    }

    private fun run() {
        try {
            if (!Librespot.available) {
                listener.onFailure(NATIVE_REASON)
                return
            }
            var backoffMs = MIN_BACKOFF_MS
            var lastReason: String? = null
            var connected = false
            var sessionUserId: String? = null
            while (running) {
                try {
                    val token = fetchToken()
                    if (token == null) {
                        Librespot.stop()
                        sessionUserId = null
                        throw Failure(NO_USER_REASON)
                    }
                    if (sessionUserId != token.userId || !Librespot.isAlive()) {
                        Librespot.stop()
                        sessionUserId = null
                        val error = Librespot.start(token.accessToken, DEVICE_NAME)
                        if (error != null) throw Failure(startReason(error))
                        sessionUserId = token.userId
                    }
                    backoffMs = MIN_BACKOFF_MS
                    lastReason = null
                    if (!connected) {
                        connected = true
                        listener.onConnected()
                    }
                    val untilExpiry = token.expiresAt - System.currentTimeMillis()
                    Thread.sleep(minOf(REFRESH_MS, maxOf(untilExpiry, MIN_BACKOFF_MS)))
                } catch (failure: Failure) {
                    connected = false
                    if (failure.reason != lastReason) {
                        lastReason = failure.reason
                        listener.onFailure(failure.reason)
                    }
                    Thread.sleep(backoffMs)
                    backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS)
                }
            }
        } catch (interrupted: InterruptedException) {
            // stop() asked for it.
        } finally {
            Librespot.stop()
        }
    }

    // The token is returned to the native layer only; it is never logged or reported.
    private fun fetchToken(): StreamToken? {
        val connection = URL("$serverUrl/spotify/stream-token").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("X-TV-Token", tvToken)
            when (val status = connection.responseCode) {
                200 -> {}
                404 -> return null
                401 -> throw Failure(EXPIRED_REASON)
                403 -> throw Failure(REFUSED_REASON)
                502 -> throw Failure("Spotify could not complete the request.")
                else -> throw Failure("The server answered with status $status.")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            return StreamToken(
                userId = json.getString("userId"),
                accessToken = json.getString("accessToken"),
                expiresAt = json.getLong("expiresAt"),
            )
        } catch (error: IOException) {
            throw Failure(UNREACHABLE_REASON)
        } catch (error: org.json.JSONException) {
            throw Failure("The server sent an unreadable Spotify token.")
        } finally {
            connection.disconnect()
        }
    }

    private class Failure(val reason: String) : Exception(reason)

    private class StreamToken(val userId: String, val accessToken: String, val expiresAt: Long)

    companion object {
        /** The name the phone lists. Documented in docs/firetv.md. */
        const val DEVICE_NAME = "DomoLED TV"

        private const val TAG = "SpotifyConnect"
        private const val TIMEOUT_MS = 10_000
        private const val REFRESH_MS = 10_000L
        private const val MIN_BACKOFF_MS = 2_000L
        private const val MAX_BACKOFF_MS = 60_000L

        private const val NO_USER_REASON = "No Spotify user is active. Log in from the TV."
        private const val EXPIRED_REASON = "Spotify login expired. Log in again from the TV."
        private const val REFUSED_REASON = "The server refused the TV token."
        private const val UNREACHABLE_REASON = "Could not reach the LED server."
        private const val PREMIUM_REASON = "Spotify Premium is needed to play on the TV."
        private const val NATIVE_REASON = "The TV player hit an unexpected error."

        // The native error text is librespot's and is not shown; only its Premium refusal is mapped.
        private fun startReason(error: String): String =
            if (error.contains("premium", ignoreCase = true)) PREMIUM_REASON else NATIVE_REASON

        /** Reads the server address and TV token that copy-assets bakes into config.js. Null when they are missing. */
        fun fromAssets(assets: AssetManager, listener: Listener): SpotifyConnect? {
            val config = try {
                assets.open("config.js").bufferedReader().use { it.readText() }
            } catch (error: IOException) {
                Log.e(TAG, "config.js missing from the assets", error)
                return null
            }
            val serverUrl = setting(config, "LED_SERVER_URL") ?: return null
            val tvToken = setting(config, "TV_TOKEN") ?: return null
            return SpotifyConnect(serverUrl, tvToken, listener)
        }

        private fun setting(config: String, name: String): String? =
            Regex("""$name\s*=\s*"([^"]+)"""").find(config)?.groupValues?.get(1)
    }
}
