package com.luketmoss.thrivesip.data

import com.luketmoss.thrivesip.core.Transport
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * The real [Transport]. Apps Script answers a POST with a 302 to another host;
 * OkHttp follows it as a GET, the way a browser does, and the body is the
 * JSON envelope. No logging interceptor, and failures carry no URL or form: the
 * form holds the key.
 */
object OkHttpTransport : Transport {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()

    override suspend fun post(url: String, form: Map<String, String>): String =
        withContext(Dispatchers.IO) {
            val body = FormBody.Builder().apply { form.forEach { (k, v) -> add(k, v) } }.build()
            val request = try {
                Request.Builder().url(url).post(body).build()
            } catch (e: IllegalArgumentException) {
                throw IOException("bad url")
            }
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
                response.body?.string() ?: throw IOException("empty response")
            }
        }
}
