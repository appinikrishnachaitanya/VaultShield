# VaultShield — Your Hybrid AI Agent

**The hybrid AI agent that protects the people most targeted by scams, without ever asking them to hand over their secrets to do it.**

Every year, millions of people — many of them elderly, many of them first-time smartphone users — lose money and peace of mind to digital-arrest calls, fake KYC messages, and predatory loan notices. The tools that could help them triage a suspicious message, a medical report, or a one-sided contract all demand the same trade: send your private details to someone else's cloud. VaultShield removes that trade-off entirely. It is one agent with five privacy-preserving skills, not five tools bolted together, and every one of them routes through the same **Privacy Router**: identifiers in a message, document, or diary entry are replaced with a typed token — `[PERSON_1]`, `[PHONE_1]`, `[UPI_1]`, `[AMOUNT_1:10k-50k]` — entirely on-device, before any AI ever sees the content. The agent reasons on-device first; cloud is only the fallback, and for text it only ever reasons over placeholders, never originals. The one deliberate exception is Media Vault's first pass: an uploaded photo, recording, or video can't be tokenized on-device the way text can, so that first transcription runs through cloud Gemini — every follow-up question about it is tokenized like everything else. A receipt proves exactly what left the device and what didn't, so the privacy claim is never just a promise.

This is what makes VaultShield different from a chatbot wrapper: it is architected, end to end, around the idea that the most vulnerable users deserve the most capable AI *and* the strongest privacy guarantees — not one traded for the other.

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

Firebase AI Logic is not a backend plumbing detail here — it *is* the privacy architecture. Every inference call in the app goes through it (`src/lib/firebase/ai.ts`), and the choice of `InferenceMode` on each call is what turns the Privacy Router's decision into an enforceable guarantee rather than a UI suggestion:

- **`InferenceMode.ONLY_ON_DEVICE`** for Check Something's first pass and for any document the router marks highly sensitive (Aadhaar, medical, bank, identity) — the SDK has no cloud path to fall back to, so there is no code path by which that content can leave the device, silently or otherwise.
- **`InferenceMode.PREFER_ON_DEVICE`** for everything else — Document Vault, diary reflection, document follow-up chat — tries Chrome's built-in on-device Gemma model first and only falls back to the Vertex AI Gemini backend when it's unavailable, with `inferenceSource` on the response checked and surfaced in the UI every time.
- **`InferenceMode.ONLY_IN_CLOUD`** reserved for the handful of calls that genuinely need the cloud — Media Vault's file analysis, call-recording transcription, and the explicit "second opinion" with Google Search grounding — each one gated behind the user's own approval first.

App Check (reCAPTCHA Enterprise on web, Play Integrity on Android) protects every one of these calls, on web and native alike. Android ships a parallel native Kotlin bridge using the same Firebase AI Logic SDK with on-device ML Kit GenAI for its first pass, so the hybrid guarantee holds whether the agent is running in a browser tab or an installed app.

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
