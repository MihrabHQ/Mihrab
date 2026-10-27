package com.prayer_times

import com.facebook.react.modules.network.CookieJarContainer
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * The HTTP client's cookie jar: none kept, none sent, and no WebView.
 *
 * React Native's networking module fills the client's cookie jar with one
 * that keeps cookies through android.webkit's CookieManager, and the first
 * request of a session therefore loaded the whole Chromium WebView into the
 * app's process — some twenty megabytes — for cookies nothing in this app
 * sends or needs. A plain "no cookies" jar is not enough: Fresco, React
 * Native's image pipeline, casts the client's jar to `CookieJarContainer`
 * at start and the app died on launch without one. So this IS a container,
 * and it ignores the jar the networking module hands it.
 */
class NoCookieJar : CookieJarContainer {
  override fun setCookieJar(cookieJar: CookieJar) = Unit

  override fun removeCookieJar() = Unit

  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = Unit

  override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
}
