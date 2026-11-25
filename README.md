# VaultShield

**Check it before you pay for it. Privately.**

VaultShield is a **Privacy Router for AI**, built for Indian families and freelancers. **Cloud reasons over placeholders. The device holds the secrets. A receipt proves what the app submitted.** Scam-message checks are the first use case; freelancer contracts and offer letters are the second.

The application uses React 19, TypeScript, Vite and Tailwind as a PWA, with a Capacitor Android wrapper. Firebase AI Logic runs the client AI flow. A Python FastAPI service handles family pairing, alerts and opt-in category aggregation; it never receives messages, images or token mappings for AI processing.

## Privacy routing and token vault

1. Paste text or choose one JPEG/PNG. The deterministic router runs before AI.
2. The device replaces detected identifiers with typed tokens such as `[PERSON_1]`, `[PHONE_1]`, `[UPI_1]` and `[AMOUNT_1:10k-50k]`. Repeated values reuse a token. Original values and the mapping exist only in tab memory.
3. Run the first local check. Supported desktop Chrome uses Firebase AI Logic `ONLY_ON_DEVICE`. Android uses the native ML Kit Prompt API for this first scan. A clearly labeled local-rules result handles text when the local model cannot run; images need a local image model.
4. For a cloud-eligible route, review the editable tokenized text and the leak check. Edits clear consent. Known original values reintroduced into the preview block approval.
5. Approve **Ask AI to check this** for SDK-managed `PREFER_ON_DEVICE`, or separately approve **Check trusted websites** for cloud search grounding. All Firebase AI Logic web calls are in `src/lib/firebase/ai.ts`.
6. Read the tokenized answer and expand its plain-text local view to restore known values. Restored values never enter translation, summary, export or cloud requests.

| Route | Policy |
| --- | --- |
| `LOCAL_ONLY` | Aadhaar/PAN, bank statements/accounts, medical, minor-related and identity-document content stays local. Cloud verification and cloud summary fallback are blocked. Images start here until local extraction can be classified. |
| `TOKENIZE_THEN_CLOUD_OK` | Suspicious messages, contracts and detected ordinary identifiers require tokenization, review and explicit consent before a cloud-capable request. |
| `LOW_RISK` | No identifiers were detected. Review and consent still apply to a cloud-capable request. This label does not establish safety. |

The shared detection layer applies NFKC normalization, zero-width removal, dash normalization and Devanagari-digit normalization. It covers Indian phone, Aadhaar, PAN, UPI, email, account, reference, IFSC, context-labeled OTP, amount and URL formats, plus labeled names/organisations. URL attributes use only `shortener`, `bank-like`, `agency-like` or `other`; amount attributes use only `lt1k`, `1k-10k`, `10k-50k` or `50k-plus`. Raw domains and exact amounts do not leave in these tokens. `[PRIVATE_n]` represents a model-masked span whose original value is unavailable for restoration.

Reset, unmount, page-hide and 15-minute idle expiry clear the vault. The original editor, screenshot, results, comparison spans and receipt are cleared on page-hide/idle expiry. The app does not put this content or mapping in localStorage, IndexedDB, Firestore, analytics, logs or service-worker caches. Saved language, family display names and account/family records are separate service data.

## Receipts, leak checks and app payload accounting

A completed primary local check or reviewed verification creates a session-only receipt with timestamp, route, SDK-reported source, cloud model when applicable, measured elapsed time, token counts, search-grounding evidence, and UTF-8 byte length of the exact cloud prompt. Local inference records zero outbound AI payload bytes. Images sent to cloud are always `no`.

**What left your device** compares the local original, with detected spans highlighted, against the exact SDK prompt. **Copy receipt** and **Download receipt (JSON)** contain metadata, the approved tokenized text and exact outbound prompt; neither contains the original or mapping. The statement “VaultShield stored nothing” is scoped to original content and token mappings, as stated beside it.

Before approval, the leak test re-runs the identifier detector and scans digit runs, mixed high-entropy strings and known vault values. Known-value substring matches are case/space insensitive and are a hard block. Other findings are warnings with local highlights. The check is deterministic; no additional AI request is made for it.

The header counts app-controlled AI payload strings and backend fetch bodies by category. SDK-reported local inference adds zero AI bytes; SDK-reported cloud inference adds the exact submitted prompt length. Failed/unknown hybrid delivery is labeled unconfirmed. This is app instrumentation, not a packet capture: HTTP headers, SDK envelopes and Firebase Auth/App Check/Remote Config/Firestore/push service traffic are excluded and disclosed separately. Receipts and counters do not independently prove what a remote provider retained.

Review remains essential: the LLM may miss names, regexes focus on Indian formats, and broad classifications can be conservative. On-device AI is experimental and depends on browser, model and hardware availability. The Android first-scan bridge uses ML Kit; its separately consented hybrid follow-up uses native Firebase AI Logic. AI output is guidance for independent verification, not a guarantee about a sender, payment or legal clause.

## Optional community pattern signal

The off-by-default opt-in shares only tactic categories, one broad URL class, one amount bucket and English/Hindi. `/patterns` requires Firebase identity and App Check, rejects extra fields, and limits contributions to one per account per hour. Pattern documents contain aggregate categories and a count only. Existing rate-limit documents keep a separate hashed account/action key and last-request time; no per-account pattern history is stored.

`GET /patterns/trending` publishes a bucket only at `PATTERN_K` observations (default 5, minimum 5). This is **k-threshold aggregation**, not a count of distinct contributors. Thresholds do not prevent repeated accounts or prove a scam. The UI displays a trending strip only when eligible buckets exist.

## Family circle

Create one 10-minute invitation code and share it with up to nine relatives. Each person enters the code and a name. Members can view their connections, save a recognizable name, and remove a connection. A help request appears in each recipient's real-time Firestore inbox with the sender's family name, time, and pressure-tactic count. FCM can also deliver a push notification. The alert contains no suspicious message, screenshot, or phone number; recipients call the person using a saved contact.

The Python service verifies Firebase ID tokens and App Check tokens, validates its request bodies, hashes invitation codes, and applies Firestore-backed rate limits. Client writes to family and alert documents are denied by `firestore.rules`; the service performs those writes. Anonymous Firebase Auth opens a private session without a login screen.

## Firebase setup

Use one Firebase project with a registered web app and Android app. Enable:

- Anonymous Authentication and Cloud Firestore.
- Firebase AI Logic with the **Agent Platform Gemini API (Vertex AI backend)** and Blaze billing.
- App Check with reCAPTCHA Enterprise for the web app and Play Integrity for Android.
- Firebase Cloud Messaging and a Web Push VAPID key.
- Firebase Remote Config. Defaults are `cloud_model_name=gemini-3.5-flash-lite`, `enable_search_grounding=true`, and `strict_privacy_mode=true`.

Copy `.env.example` to `.env.local` and fill in the Firebase web configuration, reCAPTCHA Enterprise site key, and public VAPID key. Register your local App Check debug token in Firebase Console for development. Keep `.env.local`, native Firebase configuration, service account files, and signing keys outside Git.

## Google accounts

Use **Save my account → Continue with Google** to link the current guest identity and retain its family connections. An existing Google account opens its own saved circle after confirmation. **My account** saves a family display name and the selected English/Hindi language. Settings restore on other devices after signing in.

Enable **Authentication → Sign-in method → Google** in Firebase Console and select your project support email. Under Authentication settings, authorize the Hosting domains and your development hostname. For Android, register the debug/release signing SHA-1 and SHA-256 fingerprints in Project settings, then download a fresh `google-services.json` to `android/app/`. Its generated `default_web_client_id` is used by Android Credential Manager. Rebuild the APK after updating the file. Google tokens are exchanged through Firebase Auth; passwords and tokens are never stored in profile documents.

Profile documents at `users/{uid}/settings/profile` contain only `displayName` and `language`; security rules restrict access to that authenticated owner.

## Run locally

```bash
npm ci
npm run dev
```

For the Python service, use Python 3.12+ and a virtual environment:

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Set `VITE_BACKEND_URL=http://127.0.0.1:8000` locally and `ALLOWED_ORIGINS=http://127.0.0.1:5173` for the Python service. Use Application Default Credentials for local Firebase Admin SDK access.

## Build and deploy

```bash
npm run build
npx firebase deploy --only hosting,firestore,remoteconfig --project vaultshield-2ace9
```

`firebase.json` serves `dist` and rewrites `/pair/**`, `/alerts`, `/notifications/**`, and `/patterns` routes to the `vaultshield-api` Cloud Run service in **europe-west1**. This region is retained because it is the existing deployed service; changing only a Hosting rewrite would disconnect it. Build the Dockerfile with `backend/` as its context and deploy the service in that region. Set `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` to the exact Firebase Hosting origin. `PUBLIC_APP_URL` is required when `K_SERVICE` or `ENVIRONMENT=production` is present; invalid/missing HTTPS configuration fails startup. The container runs as a non-root user and exposes `/health`; Cloud Run can use that endpoint for an HTTP startup probe. In production, leave `VITE_BACKEND_URL` empty so the web app uses Hosting's same-origin routes.

The PWA includes its own `/sw.js`, web manifest, offline app-shell cache, and family push handler. Edge and Chrome can install the hosted app. Desktop Chrome's built-in Prompt API provides the web on-device model path; the browser manages its model assets.

For Android, add the private `google-services.json` for `in.vaultshield.app`, install Java 21 and Android SDK Platform 35, and run:

```bash
npm run android:sync
```

Then build `android/app/build/outputs/apk/debug/app-debug.apk` with `android/gradlew.bat assembleDebug` on Windows or `cd android && ./gradlew assembleDebug` on macOS/Linux. `npm run android:apk` is the optional Windows project-toolchain wrapper. The APK packages the React screens; its Kotlin bridge handles Android shares, local ML Kit inference, native Firebase hybrid inference, App Check, and push registration.

## Checks

```bash
npm test
npm run build
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m unittest discover -s tests -p test_backend.py -v
```

The web suite covers redaction, consent, local and hybrid routing, language behavior, and Android bridge contracts. The Python suite covers identity checks, invitation behavior, alert payloads, rate limiting, and batched push. `.github/workflows/verify.yml` runs the web build and both suites on pushes and pull requests.

## Demo flow

Use `npm run dev`, or set `VITE_ENABLE_DEMO_STORIES=true` for an explicitly designated demo build. **Demo story** preloads a clearly synthetic freelancer contract or a synthetic legal notice. It does not simulate results; run the real check and SDK flow.

1. Show the route banner before starting the local scan.
2. Inspect typed placeholders, including broad URL/amount attributes.
3. Open review, show the leak check, and edit a known identifier back into the preview to demonstrate the hard block. Remove it and review again.
4. Approve a hybrid second opinion. Show the actual SDK source, expand the plain local restored-value view, and inspect the receipt and app payload counter.
5. Try a synthetic Aadhaar, medical report or minor-related example to demonstrate `LOCAL_ONLY`, with cloud actions blocked.
6. Pair two separate browser profiles for a named family alert. Optional Google account linking keeps the family identity across devices.

Keep demonstration inputs synthetic. A real completed result establishes that specific inference path on that tested device; browser model assets alone do not establish execution.
