package com.domo.led

import android.util.Log

/**
 * The native half of the app. Loading is lazy and never fatal: a missing library is a broken
 * build, and the scene still works without it.
 */
object Librespot {
    val version: String? by lazy {
        try {
            // loadLibrary prefixes lib: this maps to librespot_jni.so.
            System.loadLibrary("respot_jni")
            nativeVersion()
        } catch (error: UnsatisfiedLinkError) {
            Log.e(TAG, "native library unavailable", error)
            null
        }
    }

    private external fun nativeVersion(): String?

    private const val TAG = "Librespot"
}
