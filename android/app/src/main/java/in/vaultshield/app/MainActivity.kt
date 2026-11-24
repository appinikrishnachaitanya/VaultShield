package `in`.vaultshield.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.google.firebase.FirebaseApp

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            AppAttestation.install()
        }
        registerPlugin(VaultShieldNano::class.java)
        super.onCreate(savedInstanceState)
    }
}
