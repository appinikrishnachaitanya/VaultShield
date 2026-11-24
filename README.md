# VaultShield

Check it before you pay for it. Privately.

React / TypeScript / Vite / Tailwind PWA, Firebase AI Logic, and a Python FastAPI family service. No AI requests go through Python. Core privacy and cloud inference use the official Firebase SDK in `src/lib/firebase/ai.ts`. Optional Summarizer, Proofreader and strict local speech adapters are centralized in that same module and use browser APIs, as authorized for these additions.

## Run locally

1. `npm ci`
2. Copy `.env.example` to `.env.local` and enter your own Firebase web project configuration, Enterprise reCAPTCHA site key and web push VAPID public key. Never commit debug tokens or service account keys.
3. Enable Anonymous Authentication, Firestore, Firebase AI Logic with the Gemini Developer API, App Check Enterprise provider and FCM Web Push. Register your localhost App Check debug token in Firebase Console. The official SDK logs the generated debug token in development.
4. `npm run dev`. A missing configuration shows a setup status; the app never returns simulated AI results.
5. For the family service, use Python 3.12+ and create a Python virtual environment, `pip install -r backend/requirements.txt`, authenticate via Application Default Credentials, and run `uvicorn backend.main:app --reload`. Give the service account only the required Firestore, Auth verification and FCM permissions. Set `ALLOWED_ORIGINS` to your frontend's exact origin. `VITE_BACKEND_URL` points to this service in local development.

## Local AI prerequisites

Firebase hybrid web inference is experimental and currently requires desktop Chrome 139+ with supported hardware and the multimodal Prompt API enabled. Follow https://firebase.google.com/docs/ai-logic/hybrid/web/get-started for current flags and production origin-trial requirements. Download the local model online before an airplane-mode demonstration. Firebase configuration must be supplied even for local AI SDK initialization. The app uses ONLY_ON_DEVICE and checks the returned inference source. If local AI is unavailable or fails on text, VaultShield uses a labeled LOCAL RULES result for common pressure phrases and known identifier formats. Screenshots require local AI. Cloud verification always requires review and explicit consent. The Android build uses the ML Kit GenAI Prompt API through the VaultShieldNano Capacitor plugin for private checks.

## Privacy model

Original text and screenshots stay in tab memory and the local model. The model strips identifiers; deterministic rules remove additional Indian identifiers. This is defense in depth, not a guarantee that an LLM found every name or private detail. Users review and may edit the exact outbound text, then explicitly consent. Edits clear consent. An additional masking change also clears consent and requires another review. Raw images never enter cloud requests. The branded SanitizedText type prevents accidental raw strings at compile time; it is not a security sandbox or a proof of anonymization.

No message persistence or analytics. Firebase Auth, App Check and Remote Config use their normal service connections; offline means local message inference, not that the installed app has never connected to Firebase. Only the app shell is precached. Timing measures elapsed SDK calls with performance.now, not invented server latency.

After reviewing the redacted text, users choose **Get a second opinion** (`PREFER_ON_DEVICE`, no search tools) or **Check public sources online** (`ONLY_IN_CLOUD`, Google Search grounding). Both require explicit consent; editing the text or changing the purpose clears consent. Public-source checking requires connectivity and the grounding Remote Config flag. Results show actual SDK inference source, elapsed time and the configured cloud model when applicable. An unsourced response is never labeled live verification. Local check counts are redaction markers, not the model's untrusted self-reported count. The redacted preview highlights literal tactic evidence using labels plus colors and never injects model HTML.

The current web manifest does not register a share target: a share POST could reach Hosting without an active service worker. Use paste or the file picker. The legacy worker handler only supports previously installed manifests; reinstall those PWAs to remove the old registration. Android share intents use the native bridge. GET share URLs are intentionally unsupported because they expose message text to server logs.

## Family service

The Python service verifies both Firebase ID tokens and App Check tokens. High-entropy invitations expire after 10 minutes and are consumed in a transaction. Family relationships cannot be written directly by clients. Alerts require a paired member and are rate-limited to one per minute. Their payload contains only sender anonymous UID, stage count and timestamp. Firestore is the durable inbox; push delivery is best effort. Remove a connection from Family Circle to revoke both directions. Anonymous accounts are browser-specific: clearing site data loses the session. Invitation and token cleanup/retention should be configured in the project before a public launch; configure Firestore TTL on `invites.expires`.

## Build and deployment

- `npm test` tests redaction, strict local inference and cloud consent boundaries.
- `.venv/Scripts/python.exe -m unittest discover -s tests -p test_backend.py -v` runs backend route contract tests with Admin mocked.
- `npm run preview` serves the production build with service-worker support. Notification registration requires this build or deployed HTTPS, rather than the development server.
- `npm run build` type-checks and generates `dist` plus the offline PWA worker. Android builds use `dist-android` separately, so building an APK cannot overwrite Hosting assets. Use `npm run android:sync` to build and sync Android assets.
- Build the Python Dockerfile from the `backend` directory and deploy to Cloud Run as `vaultshield-api` in `asia-south1`. Set `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` to the exact Hosting origin. The backend has no AI key.
- Deploy Firestore rules and Hosting to your Firebase project using Firebase CLI. `firebase.json` rewrites family endpoints to the Python Cloud Run service. In production leave `VITE_BACKEND_URL` empty for same-origin routes. Enable App Check enforcement for AI Logic and Firestore in Console. Use a dedicated service account and set Cloud Run instance limits.
- The native `android/` project is generated. `npm run android:apk` rebuilds the frontend, syncs Capacitor and produces a debug APK using the project-local toolchain. The Android share sheet accepts pasted text and JPEG/PNG screenshots via the VaultShieldNano Capacitor plugin. The published web manifest does not register a share target: a browser share POST can reach Hosting if the worker cannot intercept it. Use paste or the file picker on the web. The legacy worker handler remains for previously installed manifests; uninstall and reinstall those PWAs to remove the share registration.
- Host over HTTPS, verify App Check metrics before enforcement, and test notifications on two separate browser profiles/devices with real project credentials.

Remote Config defaults: `cloud_model_name=gemini-3.5-flash-lite`, `enable_search_grounding=true`, `strict_privacy_mode=true`. Strict local redaction and consent are unconditional even if a remote value is changed. No prohibited sampling parameters are sent for the default model.

## Verification limits

Live model responses, on-device availability, Firebase security rules against a deployed project, real FCM delivery, origin trial registration, and Android builds require your project/device credentials. This repository cannot truthfully certify these integrations without them. Model analysis is a second opinion, never proof of safety or a definitive legal ruling.



## Optional local tools

- After a successful privacy check, **Summarize in my language** appears inside Maa Mode and follows its English/Hindi/Tamil/Marathi language selector. It summarizes the redacted English message locally using Chrome's Summarizer API, then translates the summary locally when needed. The translated summary, English comparison and redacted source are visible together. If local translation fails, the English summary is retained and labeled as English; no cloud fallback is used. Summarizer input is still declared English-only. Translation and summarization may omit or distort meaning and never establish legal safety.
- **Read aloud** and **Read summary aloud** appear only when the browser exposes an installed local voice matching the actual output language. Voice-list updates are detected automatically. No voice installation is required or requested by the app; without a suitable voice, written guidance and summaries remain available and voice buttons stay hidden. Speech synthesis is an optional operating-system/browser capability, not Nano/Gemma inference. Changing Maa Mode language clears the previous summary so stale output cannot be mislabeled. Specialist creation and measured timings include any supported download/translation work.
- **Prepare your own reply** lets the user edit a reply, proofread it locally, review a separate correction, explicitly apply it, and copy it. The incoming suspicious evidence is never rewritten. The proofreader currently declares English support.
- **Prefer speaking? Try local dictation** is above the message editor. Choose a language and explicitly prepare its local pack, then press Start. English India, Hindi India and English US are choices, with availability checked rather than assumed. Unsupported languages fail locally; there is no remote speech fallback. Review the transcript and add it to the message editor, then run the standard privacy check.
- Each optional feature can require its own download. No specialist model or speech pack is downloaded on startup. Browser capability checks control availability, and model preparation shows real progress when the API exposes it. Speech pack installation exposes status rather than an invented percentage.
- Microphone access occurs only on explicit dictation start. Recognition uses `processLocally=true`, rejects legacy APIs without a local guarantee, stops after 60 seconds or when the page is hidden, and aborts on component unmount. No audio recording is uploaded or saved by the app.
- For local Proofreader development, Chrome documents `chrome://flags/#proofreader-api` (enable and relaunch). Public deployments may require an eligible origin trial, depending on Chrome version; merely deploying the app does not enable a browser API. Docs: https://developer.chrome.com/docs/ai/proofreader-api and https://developer.chrome.com/docs/ai/summarizer-api.
- Validation: run `npm test` for the current test count. Coverage includes local-only speech, explicit pack installation, transcripts, download progress, session cleanup, cancelled Proofreader recovery through Firebase ONLY_ON_DEVICE, and consented hybrid/public-source request privacy. Browser API doubles cannot certify actual device availability.

## Generated Android project

The `android/` folder contains the real Capacitor 7 Android project (`in.vaultshield.app`). It packages the built React frontend; it does not run the Python server on the phone. It includes a VaultShield launcher icon, launch screen, and disables Android app backup.

Build prerequisites: Java 21, Android SDK Platform 35 and Build Tools 35.0.0. The optional project-local toolchain and Gradle caches live on D: in ignored `.android-toolchain/` and `.gradle-user-home/` directories. Alternatively set `JAVA_HOME` and `ANDROID_HOME` to existing installations. The Android SDK license must be accepted by the developer.

Run `npm run android:apk` to build and sync the web frontend and generate `android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug-signed APK for device testing, not a signed Play Store release. Use `npm run android:open` if Android Studio is installed.

VaultShieldNano checks and runs Android Gemini Nano directly through ML Kit. It receives Android share intents and displays diagnostic status under Privacy after five taps on the version button. Native Play Integrity is initialized when the Android Firebase app is configured. A signed Play Integrity token and Android cloud calls still need live verification. Native FCM is pending. A successful Android inference still needs an AICore-ready device. Browser-specific AI tools remain capability-gated and can be unavailable in Android System WebView. A web PWA working in desktop Chrome does not certify those features on Android. Packaged frontend backend routes also need the actual deployed HTTPS backend URL for native use; same-origin Firebase Hosting rewrites apply to the hosted PWA, not Capacitor's local origin. Do not use real sensitive data to validate unimplemented Android integrations.

Verified Android build: debug APK generated successfully, package `in.vaultshield.app`, version `1.0.0`, min SDK 26, target SDK 35. APK signature verification passed. The deliverable is `artifacts/VaultShield-debug.apk`. Physical-device execution has not yet been tested.


## Web demo and submission

1. Use a compatible desktop Chrome with the hackathon's Gemma 4 built-in AI flag and the required Prompt API settings. Allow the model to download online. Verify model readiness in chrome://on-device-internals before recording.
2. Open VaultShield, select the synthetic Digital Arrest sample, and run Check privately offline. Confirm ON-DEVICE AI and inspect the masked text and pressure signals. LOCAL RULES is the degraded text path and does not demonstrate Gemini Nano.
3. With Chrome offline and the model ready, open Review & verify, choose Get a second opinion, inspect the exact text, approve it, and confirm HYBRID · ON-DEVICE. Repeat in a browser profile without built-in AI and with a working network: a successful response should show HYBRID · CLOUD FALLBACK. Firebase makes this decision within one call. Separately choose Check public sources online, review and approve again, and confirm CLOUD · PUBLIC-SOURCE CHECK. Inspect returned sources; absent sources must remain labeled as an unsourced assessment.
4. Test a normal delivery message and a screenshot. Use the clipboard or file picker to bring a synthetic WhatsApp message into the web app. The PWA does not advertise a network-backed share target.
5. On Android, install the debug APK, open Privacy, and tap the version five times. Verify the ML Kit status. Share a synthetic text message and one JPEG/PNG into VaultShield, then run Check Privately. An unsupported device should show LOCAL RULES for text and refuse screenshot inference.
6. For a family alert demo, deploy the Python backend first and verify pairing and push delivery with a second browser profile.
7. Use npm run build before deploying the PWA to Firebase Hosting. Provide the hosted app URL, source repository with setup instructions, and a public demo video of up to three minutes. Keep secrets and debug tokens out of submissions. See https://firebasehybridaihackathon.devpost.com/rules.

Eligibility disclosure: the web core and hybrid/public-source verification actually call Firebase AI Logic. Optional Chrome specialist APIs are direct browser calls; centralizing them in ai.ts does not turn them into Firebase calls. The Android private-check bridge currently calls ML Kit directly, so do not describe it as verified Firebase AI Logic Android hybrid inference. Confirm the treatment of these additions with the organizers before claiming Android eligibility. The working desktop local-model logs do not certify Android availability.

Offline acceptance test: serve the production build, allow its service worker to activate and required models to download, then close and reopen the installed PWA offline. Verify text checking and local image support separately. A successful dev tab check alone does not prove offline reopening or cached model readiness.


## Roadmap: cloud-to-local pattern packs

A future public-source workflow can use grounded Gemini to propose anonymized scam indicators. A human reviews and versions the rules before publishing a bounded pattern pack. Devices can cache a validated pack and continue using it offline. Private user messages must stay outside that publishing workflow.


## Platform-aware privacy checks

- Desktop Chrome with a working Prompt API uses Firebase AI Logic in ONLY_ON_DEVICE mode for private scans. The header distinguishes ready, downloadable, downloading, and unavailable states.
- Android Chrome and iOS browsers use LOCAL RULES for text. Copy a message from WhatsApp and use Paste Message, or paste by hand if clipboard permission is denied. Screenshots require a working local image model. The web manifest intentionally has no share target that could transmit an original share to Hosting. Android users can share directly to the native APK instead.
- The Android APK calls VaultShieldNano directly. The diagnostics view reports the platform, engine, native status, last reported error, and whether native App Check can obtain a token. Firebase web calls from the APK request the native Play Integrity token through its bridge; live attestation and cloud authorization still need verification on the release channel.
- For hybrid verification, approve the exact reviewed text. The Remote Config default stays on gemini-3.5-flash-lite due to the earlier project-specific 2.5-model 404. If your project supports a different cloud model, set cloud_model_name in Remote Config.
