# Android 1.1.0 — hybrid test build

Package: `in.vaultshield.app`; versionCode 2; versionName 1.1.0.

## What changed

- React screens include the global English/Hindi selection and latest private scan few-shot prompt.
- The Capacitor bridge now calls Firebase AI Logic Android 18.2.0 with firebase-ai-ondevice 16.0.0-beta08. It no longer implements inference directly using ML Kit.
- Reviewed, explicitly approved text uses native `PREFER_ON_DEVICE`. Firebase SDK owns fallback. An unavailable local model is NOT a gate preventing this request from reaching the SDK.
- Native cloud provider: `GenerativeBackend.agentPlatform("global")`; model comes from Remote Config (default gemini-3.5-flash-lite). No cloud sampling parameters are sent.
- Results show the actual response inferenceSource; unknown sources fail rather than invent a badge.
- Private text/image masking uses `ONLY_ON_DEVICE`. A private text failure produces labelled LOCAL RULES and opens review automatically. Screenshots remain blocked when local AI is unavailable; paste their text instead. Original screenshots are never automatically uploaded.
- Google Search verification is explicitly `ONLY_IN_CLOUD`, with separate reviewed-text consent. Search tools do not support automatic hybrid fallback.
- Maa summaries, translation, cautious reply drafting and English polishing use the native local-only bridge. They fail clearly without a silent cloud request if the device cannot run them. Hindi model quality needs device validation; availability is not a language-quality guarantee.
- Cold-start and warm-start Android share intents are consumed locally.
- Family Circle uses native Capacitor FCM registration and notification-tap events, not the browser service worker. Notification permission is requested only by Enable notifications. FCM token upload still requires Firebase authentication and App Check at the existing backend.

## Install and App Check setup

1. Build with `npm run android:apk`. It generates `artifacts/VaultShield-debug.apk` and a SHA256 companion file. This is a debug test build, not a Play Store release.
2. Install the APK as an update to the existing app when signatures match. Do not uninstall just to refresh; uninstalling removes the anonymous family identity and local preference.
3. Open the app. In Android Studio Logcat, filter `DebugAppCheckProvider`.
4. Register the SDK-generated debug token in Firebase Console > App Check > **Android app in.vaultshield.app** > Manage debug tokens. The web app's Chrome debug token is different. Do not paste the token into code or commit it.
5. Reopen the app after registering. Debug builds use Firebase's official debug provider. Release builds compile with Play Integrity and do not contain the debug provider dependency.
6. Confirm that the Android Firebase configuration matches vaultshield-2ace9. Cloud fallback needs network, native App Check, the enabled Agent Platform API, billing/quota, and the registered Android app. This build contains no service-account private key.

## Device checks still required

- Supported model: private text and screenshot result must say ON-DEVICE AI, with actual correct tactics; ordinary delivery must not show four tactics.
- Unsupported model: text becomes LOCAL RULES; review opens; approve second opinion; result should say HYBRID · CLOUD FALLBACK when the SDK uses cloud.
- Deny/close consent: no native hybrid request.
- Edit reviewed text: consent resets. Only reviewed text reaches the hybrid bridge; no image field.
- Cloud error/offline: retain the private result and do not manufacture success.
- Switch Hindi: UI/Maa defaults synchronize; test a Hindi summary on the real model and a Hindi approved cloud explanation.
- Share plain text/image with app closed, then with app open; preserve original private intake on device.
- Pair two test users, enable notifications on recipient, send one minimal help request, test foreground receipt and background notification tap. OS delivery is not proven by compilation or mocked tests.
- Release publishing requires a real release signing key and Play Integrity registration. Neither is fabricated by this build.

## Sources

- https://firebase.google.com/docs/ai-logic/hybrid/android/get-started
- https://firebase.google.com/docs/ai-logic/hybrid/android/configuration-options
- https://capacitorjs.com/docs/v7/apis/push-notifications
