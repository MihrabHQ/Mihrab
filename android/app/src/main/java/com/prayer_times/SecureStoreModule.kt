package com.prayer_times

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeMihrabSecureStoreSpec

/**
 * The encrypted store behind src/native/SecureStore.ts: the saved place,
 * the prayer journal, the fasting log and this device's sync identity.
 *
 * The app's own, in place of react-native-encrypted-storage, which is no
 * longer maintained. IT OPENS THE SAME FILE WITH THE SAME KEYS: the
 * preferences file [FILE], a master key of the same scheme (AES-256-GCM in
 * the Android Keystore, under androidx's default alias), keys encrypted
 * with AES-256-SIV and values with AES-256-GCM — so everything a copy of
 * the app wrote through the library is read here as it was, with nothing
 * to move. Change none of the four without a migration: a different file
 * or scheme is an empty journal.
 *
 * What the library did when the encrypted file could not be opened is kept
 * too: it fell back to a plain preferences file of the same name, and so
 * does this (a device where the Keystore failed once has its data there).
 */
class SecureStoreModule(context: ReactApplicationContext) : NativeMihrabSecureStoreSpec(context) {
  override fun getName() = NAME

  // The process's one store, opened once: by `warm` on a start that shows a
  // window, or by the first call here.
  private val prefs: SharedPreferences? get() = store(reactApplicationContext).value

  override fun setItem(key: String, value: String, promise: Promise) {
    val store = prefs ?: return promise.reject(E_STORE, "The secure store could not be opened")
    if (store.edit().putString(key, value).commit()) promise.resolve(null)
    else promise.reject(E_STORE, "Could not save $key")
  }

  override fun getItem(key: String, promise: Promise) {
    val store = prefs ?: return promise.reject(E_STORE, "The secure store could not be opened")
    try {
      promise.resolve(store.getString(key, null))
    } catch (e: Exception) {
      // A value that cannot be decrypted is an error to the caller, never
      // "nothing stored": durableWrite tells the two apart before it writes.
      promise.reject(E_STORE, "Could not read $key", e)
    }
  }

  override fun removeItem(key: String, promise: Promise) {
    val store = prefs ?: return promise.reject(E_STORE, "The secure store could not be opened")
    if (store.edit().remove(key).commit()) promise.resolve(null)
    else promise.reject(E_STORE, "Could not remove $key")
  }

  companion object {
    const val NAME = "MihrabSecureStore"
    /** react-native-encrypted-storage's file. See the note on the class. */
    const val FILE = "RN_ENCRYPTED_STORAGE_SHARED_PREF"
    private const val E_STORE = "E_SECURE_STORE"

    @Volatile private var shared: Lazy<SharedPreferences?>? = null

    private fun store(context: Context): Lazy<SharedPreferences?> =
      shared ?: synchronized(this) {
        shared ?: lazy { open(context.applicationContext) }.also { shared = it }
      }

    /**
     * OPENED WHILE THE JAVASCRIPT STARTS, NOT WHEN IT FIRST ASKS.
     *
     * Opening the store builds the master key in the Android Keystore and
     * the two ciphers: some fifty milliseconds. The library this replaced
     * did it when its module was made — at start-up, like every module then,
     * beside the JavaScript loading. Made when first needed, as modules are
     * now, it is opened by the first read: the settings', with the first
     * screen waiting on it. Measured, 2.39.0 against main (Nov 2026): the
     * settings were ready 58 ms later after the JavaScript started, on a
     * Pixel 2 and a Pixel 10 Pro alike.
     *
     * So a start that will show a window opens it on a thread of its own
     * from the process's first moment (`MainApplication`). A read that
     * arrives first waits for that same opening, not a second one.
     */
    fun warm(context: Context) {
      val opening = store(context)
      Thread({ opening.value }, "MihrabSecureStoreWarm").start()
    }

    private fun open(context: Context): SharedPreferences? =
      try {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
          context,
          FILE,
          key,
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
      } catch (e: Exception) {
        Log.e(NAME, "The encrypted preferences could not be opened; using the plain file, as before", e)
        try {
          context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        } catch (e2: Exception) {
          null
        }
      }
  }
}
