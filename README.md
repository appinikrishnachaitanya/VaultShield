# VaultShield — Your Hybrid AI Agent

**A hybrid AI personal agent that keeps every task on-device first — with an inspectable record of what, if anything, was ever sent to the cloud.**

VaultShield is one agent with several privacy-preserving skills, not five separate tools bolted together. Every skill routes through the same **Privacy Router**: identifiers in a message, document, or diary entry are replaced with a typed token — `[PERSON_1]`, `[PHONE_1]`, `[UPI_1]`, `[AMOUNT_1:10k-50k]` — entirely on-device, before any AI ever sees the content. The agent reasons on-device first; cloud is only the fallback, and for text it only ever reasons over placeholders, never originals. The one exception is Media Vault's first pass: an uploaded photo, recording, or video can't be tokenized on-device the way text can, so that first transcription or description is sent to cloud Gemini as-is — every follow-up question about it is tokenized like everything else. A receipt proves exactly what left the device and what didn't.

Built for the moment a scam message, a predatory loan notice, or a one-sided contract lands in someone's hands — and for the family members who want to help without ever reading the private details.

## The agent's skills

- **Check Something** — paste a suspicious message, screenshot, or payment request. On-device AI breaks down the four classic pressure tactics (Authority, Fear, Urgency, Secrecy) with quoted evidence, in English, Hindi, or Hinglish — entirely offline, with a cloud "second opinion" available only on explicit approval.
- **Document Vault** — scan a medical report, loan notice, land deed, or legal summons. Every identifier is masked on-device before the document is analyzed for red flags, key facts, and missing information. Follow-up chat answers questions about the document using only privacy tokens.
- **Media Vault** — upload an audio recording, image, or video. Identifiers are masked before any follow-up chat leaves the device; the first pass transcribes and flags concerns in the content's own language.
- **Private Diary** — a standout: entries are encrypted client-side with AES-GCM, keyed by a PIN the agent never stores — not even VaultShield can read a diary without it. The agent reflects on each entry (mood, action items, learnings) through the same on-device-first pipeline, seeing only tokenized text.
- **Family Circle** — pair with up to nine trusted relatives using a short-lived invitation code. A help request reaches their phone with the pressure-tactic count and nothing else — no message text, no screenshot, no phone number.
- **Privacy receipt** — every skill produces a record of exactly what was tokenized, what (if anything) reached the cloud, and how long it took. Nothing is more convincing than being able to inspect the evidence yourself.

## How the privacy router works

1. Paste text, upload a document image, or record audio. A deterministic router classifies sensitivity before any AI runs.
2. The device replaces every detected identifier — names, phone numbers, Aadhaar, PAN, UPI IDs, account numbers, amounts, URLs — with a typed token. The mapping lives only in memory for that tab.
3. The first pass always runs **on-device only** (Firebase AI Logic `ONLY_ON_DEVICE` on desktop Chrome, native ML Kit on Android) — no cloud fallback, no silent escalation.
4. For a cloud-eligible second opinion, the user reviews the exact tokenized text before approving — a leak check flags anything that still looks like a real identifier.
5. The answer comes back over tokens and is rehydrated locally. Restored values never re-enter a cloud request.

Highly sensitive content — Aadhaar numbers, medical reports, identity documents — defaults to a local-only route that cloud approval cannot override.

## Firebase AI Logic

All AI inference runs through Firebase AI Logic (`src/lib/firebase/ai.ts`), using the Vertex AI Gemini backend for cloud inference and Chrome's built-in hybrid on-device model (Gemma) for local inference, with App Check (reCAPTCHA Enterprise on web, Play Integrity on Android) protecting every call. Android ships a native Kotlin bridge using the same SDK with on-device ML Kit for its first scan.

## Tech stack

React 19, TypeScript, Vite, and Tailwind, shipped as an installable PWA with a Capacitor Android wrapper. A Python FastAPI service on Cloud Run handles family pairing, push alerts, and opt-in community pattern aggregation — it never receives raw messages, images, or token mappings.

## Family Circle & community signal

A 10-minute invitation code pairs up to nine relatives; help requests arrive over Firestore and FCM push with only a pressure-tactic count and timestamp — never the message itself. An opt-in community signal lets users anonymously contribute pressure-tactic categories to help spot shared scam patterns, published only once a threshold of independent contributions is met.

## Google accounts

Guests can link a Google account at any time to carry their family circle and saved preferences across devices, without ever requiring sign-in to use the app.

## Firebase setup

1. Create a Firebase project with a registered web app and Android app.
2. Enable Anonymous Authentication and Cloud Firestore.
3. Enable Firebase AI Logic with the Vertex AI Gemini backend and Blaze billing.
4. Enable App Check — reCAPTCHA Enterprise (web) and Play Integrity (Android).
5. Enable Cloud Messaging and generate a Web Push VAPID key.
6. Enable Remote Config (`cloud_model_name`, `enable_search_grounding`).

Copy `.env.example` to `.env.local` and fill in the web config, reCAPTCHA Enterprise site key, and VAPID key. Register a local App Check debug token in the Firebase console for development.

## Run locally

```bash
npm ci
npm run dev
```

For the Python service:

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Set `VITE_BACKEND_URL=http://127.0.0.1:8000` and `ALLOWED_ORIGINS=http://127.0.0.1:5173`.

## Build and deploy

```bash
npm run build
npx firebase deploy --only hosting,firestore,remoteconfig --project vaultshield-2ace9
```

`firebase.json` rewrites `/pair/**`, `/alerts`, `/notifications/**`, and `/patterns` to the `vaultshield-api` Cloud Run service. In production, leave `VITE_BACKEND_URL` empty so the app uses Hosting's same-origin routes.

For Android, add `google-services.json` for `in.vaultshield.app` under `android/app/`, then:

```bash
npm run android:sync
cd android && ./gradlew assembleDebug
```

## Tests

```bash
npm test
npm run build
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m unittest discover -s tests -p test_backend.py -v
```

`.github/workflows/verify.yml` runs the web build and the Python backend suite on every push and pull request.

## License

Apache 2.0 — see `LICENSE`.
