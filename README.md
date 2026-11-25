# VaultShield

**Check it before you pay for it. Privately.**

VaultShield helps Indian families and freelancers pause before acting on suspicious messages, screenshots, payment requests, invoices, and contracts. It is a React, TypeScript, Vite, and Tailwind progressive web app with a Capacitor Android package. Firebase AI Logic powers hybrid inference; a Python FastAPI service manages family pairing and alerts.

## How the privacy flow works

1. Paste a message or add one JPEG or PNG screenshot.
2. VaultShield checks the original locally, masks identifiers, and explains any Authority, Fear, Urgency, and Secrecy tactics it finds.
3. Review and edit the exact redacted text. Editing clears the approval checkbox.
4. Choose **Ask AI to check this** for Firebase AI Logic `PREFER_ON_DEVICE`, or **Check trusted websites** for cloud search grounding. Approve the reviewed text before either request.
5. Read the result with its actual on-device or cloud source badge and measured elapsed time. Ask family for help with a separate tap.

The first scan uses `ONLY_ON_DEVICE` through Firebase AI Logic on supported desktop Chrome. The Android private scan uses the native VaultShieldNano bridge and ML Kit. Text can use clearly labeled local rules when a local model is unavailable. After approval, Firebase AI Logic chooses local or cloud inference for the reviewed text. The screenshot itself stays on the device; only reviewed redacted text is eligible for cloud inference. All Firebase AI Logic web calls are centralized in `src/lib/firebase/ai.ts`.

The local check can inspect original URLs and payment amounts. The outbound preview masks full URLs and exact amounts. For example, `Pay ₹50,000 at https://verify.example/path?token=secret` becomes `Pay [REDACTED] at [REDACTED]` before a cloud-eligible request. A user can edit the preview before approving it.

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

`firebase.json` serves `dist` and rewrites `/pair/**`, `/alerts`, and `/notifications/**` to the `vaultshield-api` Cloud Run service in **europe-west1**. Build the Dockerfile with `backend/` as its context and deploy the service in that region. Set `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` to the exact Firebase Hosting origin. The container runs as a non-root user and exposes `/health`; Cloud Run can use that endpoint for an HTTP startup probe. In production, leave `VITE_BACKEND_URL` empty so the web app uses Hosting's same-origin routes.

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

1. In desktop Chrome, prepare the built-in model, then run the synthetic **Digital arrest** example. Show the on-device badge, masked preview, and four pressure tactics.
2. Run **A normal message** to show that a routine delivery update does not become an automatic scam verdict.
3. Review the redacted text and approve an AI second opinion. Show the actual inference-source badge. Use **Check trusted websites** for a separately approved public-source check.
4. Select Hindi and open the short Maa Mode explanation. Show the family-safe actions and the optional local reply tools.
5. Pair two separate browser profiles with one family code. Send a synthetic help request and show the named sender in the recipient's inbox and push notification.

Use synthetic messages and screenshots in the demo. AI guidance supports a pause and independent verification before any payment or disclosure.
