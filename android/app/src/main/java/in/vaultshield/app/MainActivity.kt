package `in`.vaultshield.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            FirebaseAppCheck.getInstance()
                .installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
        }
        registerPlugin(VaultShieldNano::class.java)
        super.onCreate(savedInstanceState)
    }
}
