package com.domo.led

import android.util.Log

/**
 * The native half of the app. Loading is lazy and never fatal: a missing library is a broken
 * build, and the scene still works without it.
 */
object Librespot {
    val available: Boolean by lazy {
        try {
            // loadLibrary prefixes lib: this maps to librespot_jni.so.
            System.loadLibrary("respot_jni")
            true
        } catch (error: UnsatisfiedLinkError) {
            Log.e(TAG, "native library unavailable", error)
            false
        }
    }

    val version: String? by lazy { if (available) nativeVersion() else null }

    /** Null when the session is up, otherwise the reason it could not start. */
    fun start(accessToken: String, deviceName: String): String? =
        if (available) nativeStart(accessToken, deviceName) else unavailable

    fun stop() {
        if (available) nativeStop()
    }

    fun isAlive(): Boolean = available && nativeIsAlive()

    fun isPlaying(): Boolean = available && nativeIsPlaying()

    fun control(action: Int) {
        if (available) nativeControl(action)
    }

    // JNI looks these up by their JVM names, and Kotlin only renames `internal` declarations
    // (nativeStop would become nativeStop$app_debug), so they stay private.
    private external fun nativeVersion(): String?

    private external fun nativeStart(accessToken: String, deviceName: String): String?

    private external fun nativeStop()

    private external fun nativeIsAlive()

    private external fun nativeIsPlaying()

    private external fun nativeControl(action: Int)

    /** Same codes as `native/jni/src/connect.rs`. */
    const val ACTION_PLAY = 0
    const val ACTION_PAUSE = 1
    const val ACTION_PLAY_PAUSE = 2
    const val ACTION_NEXT = 3
    const val ACTION_PREVIOUS = 4

    private const val unavailable = "The native player is not available."
    private const val TAG = "Librespot"
}
