// PRIVACY RULE: Never store, log, or send original unredacted user content to cloud/Firestore.
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
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.ai.OnDeviceModelStatus
import org.json.JSONArray
import kotlinx.coroutines.*

@OptIn(PublicPreviewAPI::class)
@CapacitorPlugin(name = "VaultShieldNano")
class VaultShieldNano : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val firebaseAI by lazy { FirebaseAI.getInstance(FirebaseApp.getInstance(), GenerativeBackend.agentPlatform("global")) }
    private val model by lazy { firebaseAI.generativeModel(
        modelName = "gemini-3.5-flash-lite",
        onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE)
    ) }
    private val deviceExtension get() = requireNotNull(model.onDeviceExtension) { "Android local inference is unavailable." }
    @Volatile private var lastStatus = "NOT_CHECKED"
    @Volatile private var lastError = ""
    @Volatile private var pendingShare: Intent? = null

    override fun load() {
        activity.intent?.takeIf { it.action == Intent.ACTION_SEND }?.let { pendingShare = it }
    }

    @PluginMethod
    fun checkStatus(call: PluginCall) = runProbe(call) {
        var status = deviceExtension.checkStatus()
        if (call.getBoolean("prepare", false) == true && status == OnDeviceModelStatus.DOWNLOADABLE) {
            lastStatus = "DOWNLOADING"
            deviceExtension.download().collect { update ->
                Log.i(TAG, "Download: ${update.javaClass.simpleName}")
            }
            status = deviceExtension.checkStatus()
        }
        lastStatus = statusName(status)
        Log.i(TAG, "ML Kit status: $lastStatus ($status)")
        JSObject().put("status", lastStatus)
    }

    @PluginMethod
    fun analyze(call: PluginCall) = runProbe(call, timeout = 120_000) {
        val prompt = call.getString("text").orEmpty()
        require(prompt.isNotBlank()) { "A local prompt is required." }
        val status = deviceExtension.checkStatus()
        lastStatus = statusName(status)
        if (status != OnDeviceModelStatus.AVAILABLE) {
            JSObject().put("status", lastStatus)
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
                else model.generateContent(content { image(bitmap); text(prompt) })
            } finally {
                bitmap?.recycle()
            }
            require(response.inferenceSource == InferenceSource.ON_DEVICE) { "Non-local private response blocked." }
            val text = response.text?.takeIf { it.isNotBlank() }
                ?: error("The local model returned no text.")
            JSObject().put("status", "READY").put("text", text)
        }
    }

    @PluginMethod
    fun verifyReviewed(call: PluginCall) = runProbe(call, timeout = 90_000) {
        require(call.getBoolean("consent", false) == true) { "Explicit permission is required." }
        val prompt = call.getString("prompt").orEmpty()
        require(prompt.isNotBlank() && prompt.length <= 32000) { "Invalid reviewed prompt." }
        require(!call.data.has("imageBase64")) { "Reviewed verification accepts text only." }
        val modelName = call.getString("model").orEmpty()
        require(Regex("gemini-[a-zA-Z0-9.-]{1,80}").matches(modelName)) { "Invalid model name." }
        val publicSources = call.getString("purpose") == "public-sources"
        val hybridModel = firebaseAI.generativeModel(
            modelName = modelName,
            generationConfig = generationConfig { maxOutputTokens = 1200 },
            tools = if (publicSources) listOf(Tool.googleSearch()) else null,
            onDeviceConfig = OnDeviceConfig(mode = if (publicSources) InferenceMode.ONLY_IN_CLOUD else InferenceMode.PREFER_ON_DEVICE)
        )
        val started = android.os.SystemClock.elapsedRealtime()
        val response = hybridModel.generateContent(prompt)
        val source = when (response.inferenceSource) {
            InferenceSource.ON_DEVICE -> "ON_DEVICE"
            InferenceSource.IN_CLOUD -> "IN_CLOUD"
            else -> error("Unknown inference source.")
        }
        val output = response.text?.takeIf { it.isNotBlank() } ?: error("Empty verification.")
        val result = JSObject().put("status", "READY").put("text", output)
            .put("source", source).put("durationMs", android.os.SystemClock.elapsedRealtime() - started)
        response.candidates.firstOrNull()?.groundingMetadata?.let { metadata ->
            val chunks = JSONArray()
            metadata.groundingChunks.forEach { chunk ->
                val entry = JSObject()
                chunk.web?.let { web -> entry.put("web", JSObject().put("uri", web.uri).put("title", web.title)) }
                chunks.put(entry)
            }
            val grounding = JSObject().put("groundingChunks", chunks)
            metadata.searchEntryPoint?.let { grounding.put("searchEntryPoint", JSObject().put("renderedContent", it.renderedContent)) }
            result.put("metadata", grounding)
        }
        Log.i(TAG, "Reviewed verification completed: $source")
        result
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

    private fun statusName(status: OnDeviceModelStatus) = when (status) {
        OnDeviceModelStatus.AVAILABLE -> "READY"
        OnDeviceModelStatus.DOWNLOADABLE -> "DOWNLOAD_REQUIRED"
        OnDeviceModelStatus.DOWNLOADING -> "DOWNLOADING"
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
                lastError = if (error is IllegalArgumentException) "INVALID_REQUEST" else "FAILED"
                Log.w(TAG, "Operation failed: $lastError (${error.javaClass.simpleName})")
                val result = JSObject().put("status", lastError)
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


