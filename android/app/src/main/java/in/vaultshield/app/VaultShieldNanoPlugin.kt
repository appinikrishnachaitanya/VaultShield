package `in`.vaultshield.app

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.Log
import androidx.core.content.IntentCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.*
import kotlinx.coroutines.*

@CapacitorPlugin(name = "VaultShieldNano")
class VaultShieldNano : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val model by lazy { Generation.getClient() }
    @Volatile private var lastMlKitStatus: Int? = null
    @Volatile private var lastStatus = "NOT_CHECKED"
    @Volatile private var lastError = ""
    @Volatile private var lastErrorCode: Int? = null
    @Volatile private var pendingShare: Intent? = null

    @PluginMethod
    fun checkStatus(call: PluginCall) = runProbe(call) {
        var status = model.checkStatus()
        if (call.getBoolean("prepare", false) == true && status == FeatureStatus.DOWNLOADABLE) {
            lastStatus = "DOWNLOADING"
            model.download().collect { update ->
                Log.i(TAG, "Download: ${update.javaClass.simpleName}")
            }
            status = model.checkStatus()
        }
        lastMlKitStatus = status
        lastStatus = statusName(status)
        Log.i(TAG, "ML Kit status: $lastStatus ($status)")
        JSObject().put("status", lastStatus).put("mlKitStatus", status)
    }

    @PluginMethod
    fun analyze(call: PluginCall) = runProbe(call, timeout = 120_000) {
        val prompt = call.getString("text").orEmpty()
        require(prompt.isNotBlank()) { "A local prompt is required." }
        val status = model.checkStatus()
        lastMlKitStatus = status
        lastStatus = statusName(status)
        if (status != FeatureStatus.AVAILABLE) {
            JSObject().put("status", lastStatus).put("mlKitStatus", status)
        } else {
            val bitmap = call.getString("imageBase64")?.let { encoded ->
                val bytes = Base64.decode(encoded, Base64.DEFAULT)
                require(bytes.size <= MAX_IMAGE_SIZE) { "Screenshot is too large." }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid screenshot." }
                val options = BitmapFactory.Options().apply {
                    inSampleSize = 1
                    while (maxOf(bounds.outWidth, bounds.outHeight) / inSampleSize > 2048) {
                        inSampleSize *= 2
                    }
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                    ?: error("Android could not decode the screenshot.")
            }
            val response = try {
                if (bitmap == null) model.generateContent(prompt)
                else model.generateContent(GenerateContentRequest.Builder(ImagePart(bitmap), TextPart(prompt)).build())
            } finally {
                bitmap?.recycle()
            }
            val text = response.candidates.firstOrNull()?.text?.takeIf { it.isNotBlank() }
                ?: error("The local model returned no text.")
            JSObject().put("status", "READY").put("text", text)
        }
    }

    @PluginMethod
    fun getAppCheckToken(call: PluginCall) {
        if (FirebaseApp.getApps(context).isEmpty()) {
            call.reject("Android Firebase is not configured.", "APP_CHECK_CONFIG")
            return
        }
        FirebaseAppCheck.getInstance().getAppCheckToken(false)
            .addOnSuccessListener { token ->
                call.resolve(JSObject().put("token", token.token).put("expireTimeMillis", token.expireTimeMillis))
            }
            .addOnFailureListener { error ->
                Log.w(TAG, "Play Integrity token unavailable: ${error.javaClass.simpleName}")
                call.reject("Android Play Integrity token unavailable.", "APP_CHECK_UNAVAILABLE")
            }
    }

    @PluginMethod
    fun diagnostics(call: PluginCall) {
        val data = JSObject().put("modelStatus", lastStatus).put("lastError", lastError)
        lastMlKitStatus?.let { data.put("mlKitStatus", it) }
        lastErrorCode?.let { data.put("lastErrorCode", it) }
        if (FirebaseApp.getApps(context).isEmpty()) {
            call.resolve(data.put("appCheck", "Not configured"))
            return
        }
        FirebaseAppCheck.getInstance().getAppCheckToken(false)
            .addOnSuccessListener { call.resolve(data.put("appCheck", "Token available")) }
            .addOnFailureListener { call.resolve(data.put("appCheck", "Token unavailable")) }
    }

    override fun handleOnNewIntent(intent: Intent) {
        if (intent.action != Intent.ACTION_SEND) return
        synchronized(this) { pendingShare = intent }
        notifyListeners("shareReceived", JSObject())
    }

    @PluginMethod
    fun getSharedData(call: PluginCall) = runProbe(call, timeout = 15_000) {
        val intent = synchronized(this) {
            pendingShare.also { pendingShare = null }
        }
        if (intent != null) Log.i(TAG, "Consumed a native share")
        if (intent == null) JSObject()
        else if (intent.type == "text/plain") {
            JSObject().put("text", intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.take(16000)?.toString().orEmpty())
        } else {
            val uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                ?: error("Missing shared image.")
            require(uri.scheme == "content") { "Unsupported shared image URI." }
            val mime = context.contentResolver.getType(uri) ?: intent.type
            require(mime == "image/jpeg" || mime == "image/png") { "Only JPEG and PNG images are supported." }
            val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                var count = input.read(buffer)
                while (count != -1) {
                    require(output.size() + count <= MAX_IMAGE_SIZE) { "Shared image is too large." }
                    output.write(buffer, 0, count)
                    count = input.read(buffer)
                }
                output.toByteArray()
            } ?: error("Cannot open the shared image.")
            JSObject().put("image", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("mimeType", mime)
        }
    }

    private fun statusName(status: Int) = when (status) {
        FeatureStatus.AVAILABLE -> "READY"
        FeatureStatus.DOWNLOADABLE -> "DOWNLOAD_REQUIRED"
        FeatureStatus.DOWNLOADING -> "DOWNLOADING"
        else -> "UNAVAILABLE"
    }

    private fun runProbe(call: PluginCall, timeout: Long = 600_000, block: suspend () -> JSObject) {
        scope.launch {
            try {
                call.resolve(withTimeout(timeout) { block() })
            } catch (_: TimeoutCancellationException) {
                lastError = "TIMEOUT"
                call.resolve(JSObject().put("status", lastError))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val code = (error as? GenAiException)?.errorCode
                lastErrorCode = code
                lastError = when (code) {
                    606 -> "FEATURE_NOT_FOUND"
                    GenAiException.ErrorCode.BUSY -> "BUSY"
                    GenAiException.ErrorCode.NOT_SUPPORTED -> "NOT_SUPPORTED"
                    else -> "FAILED"
                }
                Log.w(TAG, "Operation failed: $lastError (${code ?: "no ML Kit code"})")
                val result = JSObject().put("status", lastError)
                if (code != null) result.put("errorCode", code)
                call.resolve(result)
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        pendingShare = null
        super.handleOnDestroy()
    }

    companion object {
        private const val TAG = "VaultShieldNano"
        private const val MAX_IMAGE_SIZE = 8 * 1024 * 1024
    }
}


