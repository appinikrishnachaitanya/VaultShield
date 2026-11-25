package `in`.vaultshield.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.JSObject
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.*

@CapacitorPlugin(name = "VaultShieldAccount")
class VaultShieldAccount : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    @PluginMethod
    fun googleToken(call: PluginCall) {
        val resource = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
        if (resource == 0) {
            call.reject("Enable Google sign-in in Firebase and download the updated google-services.json.")
            return
        }
        scope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(context.getString(resource)).build()
                val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val result = CredentialManager.create(context).getCredential(activity, request)
                val credential = GoogleIdTokenCredential.createFrom(result.credential.data)
                call.resolve(JSObject().put("idToken", credential.idToken))
            } catch (e: Exception) {
                call.reject("Google sign-in was cancelled or unavailable. Please try again.")
            }
        }
    }
    override fun handleOnDestroy() { scope.cancel() }
}
