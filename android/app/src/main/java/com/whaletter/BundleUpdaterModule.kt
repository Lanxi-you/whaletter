package com.whaletter

import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * 热更新的文件那一半。
 *
 * JS 那边只管问「现在是什么版本」「能不能下」；真正落地的东西必须走原生——
 * React Native 自己没有可写的文件系统 API，绕不过去。
 *
 * 下下来的 bundle 放 filesDir/bundle/index.android.bundle，
 * MainApplication.getJSBundleFile() 会优先用它，所以下次冷启动就换了新界面，
 * 不用装新 APK。
 */
class BundleUpdaterModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

  private val io = Executors.newSingleThreadExecutor()

  override fun getName() = "BundleUpdater"

  private fun dir() = File(ctx.filesDir, "bundle")
  private fun live() = File(dir(), "index.android.bundle")
  private fun meta() = File(dir(), "version.json")

  /** 当前跑的是哪个版本：有热更新的就用热更新的版本号，没就是空串（代表 APK 自带的那份） */
  @ReactMethod
  fun currentVersion(promise: Promise) {
    try {
      val f = meta()
      if (!live().exists() || !f.exists()) {
        promise.resolve("")
        return
      }
      val json = f.readText()
      val m = Regex("\"version\"\\s*:\\s*\"([^\"]*)\"").find(json)
      promise.resolve(m?.groupValues?.get(1) ?: "")
    } catch (e: Exception) {
      promise.resolve("")
    }
  }

  /** 下载并启用一个新 bundle。url 是完整地址，sha256 传空就跳过校验。 */
  @ReactMethod
  fun download(url: String, version: String, sha256: String, note: String, promise: Promise) {
    io.execute {
      var conn: HttpURLConnection? = null
      try {
        val d = dir()
        if (!d.exists()) d.mkdirs()
        val tmp = File(d, "download.tmp")

        conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 20000
          readTimeout = 60000
          instanceFollowRedirects = true
          requestMethod = "GET"
        }
        val code = conn.responseCode
        if (code != 200) {
          promise.reject("http_$code", "下载失败：HTTP $code")
          return@execute
        }

        conn.inputStream.use { input ->
          FileOutputStream(tmp).use { out ->
            input.copyTo(out, 64 * 1024)
          }
        }

        val size = tmp.length()
        if (size < 1024) {
          tmp.delete()
          promise.reject("too_small", "下下来的文件太小了（$size 字节）")
          return@execute
        }

        // 校验：下坏了就宁可不要更新，也不能让 App 起不来
        if (sha256.isNotEmpty()) {
          val got = sha256Of(tmp)
          if (!got.equals(sha256, ignoreCase = true)) {
            tmp.delete()
            promise.reject("bad_hash", "文件校验没过，这次不更新")
            return@execute
          }
        }

        val target = live()
        if (target.exists()) target.delete()
        if (!tmp.renameTo(target)) {
          tmp.copyTo(target, overwrite = true)
          tmp.delete()
        }
        meta().writeText(
          "{\"version\":\"$version\",\"note\":\"$note\",\"size\":$size}"
        )

        val r = Arguments.createMap()
        r.putString("version", version)
        r.putDouble("size", size.toDouble())
        promise.resolve(r)
      } catch (e: Exception) {
        try { File(dir(), "download.tmp").delete() } catch (_: Exception) {}
        promise.reject("download_failed", e.message ?: "下载出错", e)
      } finally {
        try { conn?.disconnect() } catch (_: Exception) {}
      }
    }
  }

  /** 丢掉热更新，回到 APK 自带的那份（出事了用来救命） */
  @ReactMethod
  fun clear(promise: Promise) {
    try {
      live().delete()
      meta().delete()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("clear_failed", e.message, e)
    }
  }

  private fun sha256Of(f: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    f.inputStream().use { input ->
      val buf = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buf)
        if (n <= 0) break
        md.update(buf, 0, n)
      }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
  }
}