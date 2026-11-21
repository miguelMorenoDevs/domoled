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

    private external fun nativeVersion(): String?

    /** Null when the session is up, otherwise the reason it could not start. */
    internal external fun nativeStart(accessToken: String, deviceName: String): String?

    internal external fun nativeStop()

    internal external fun nativeIsAlive(): Boolean

    private const val TAG = "Librespot"
}
