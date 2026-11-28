# VaultShield — Agent Guide

VaultShield is a React + TypeScript web app (Vite) with an Android wrapper (Capacitor). It
helps users detect scams, analyze documents and media, and protect their privacy using a
hybrid AI strategy: **on-device first, cloud only as fallback**.

---

## Build & Dev

```bash
npm ci          # install deps
npm run build   # production build
npm run dev     # vite dev server
```

> `npm test` runs a small vitest suite (`tests/`). CI runs `npm ci` + `npm run build` only —
> it does not run tests.

---

## Architecture

### Hybrid AI routing (`src/lib/firebase/ai.ts`)

All text AI calls **must** use `InferenceMode.PREFER_ON_DEVICE`:

```typescript
getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: { createOptions: chromeModelOptions(false) },
  inCloudParams: { model: modelName },
})
```

**Never add `responseMimeType: "application/json"` to `inCloudParams`** in a
PREFER_ON_DEVICE call — it biases Firebase's routing toward cloud because on-device models
don't advertise JSON output mode support. Parse structured output from plain text manually.

Exceptions (correctly kept as `ONLY_IN_CLOUD`):
- `runCloudDocumentAnalysis` — cloud-only helper, explicit JSON output mode
- `verifyWithCloud` (public-sources purpose only) — requires Google Search grounding
  (cloud-only feature); its "hybrid" purpose stays `PREFER_ON_DEVICE`
- `analyzeMediaFile`, `transcribeCallRecording` — media files can't run on-device

### Privacy / TokenVault (`src/lib/tokenVault.ts`)

**PRIVACY RULE (enforced comment in `ai.ts`): Never store, log, or send original
unredacted user content to cloud/Firestore.**

Before any cloud call, text must pass through `TokenVaultSession.tokenize()` which replaces
names, phone numbers, account numbers, and other PII with tokens like `[PERSON_1]`. Answers
are rehydrated with `vault.resolve()` before showing the user.

`assertNoKnownLeak(tokenizedText, vault)` guards against accidental PII leaks — always call
it before sending tokenized text to cloud.

### On-device capability checks (`src/services/aiCapability.ts`)

- `chromeAvailability(image?)` — calls `window.LanguageModel.availability()`, returns
  `"available" | "downloadable" | "downloading" | "unavailable"`
- `chromeModelOptions(image)` — returns `LanguageModelCreateOptions` suitable for Firebase's
  `onDeviceParams.createOptions`
- `detectAIPlatform()` — returns `"desktop-chrome"` for Chrome; on-device only works there

### Android path (`src/services/androidNano.ts`)

`usesAndroidModel()` detects the Capacitor Android environment. When true, calls go through
`androidAI` (MediaPipe / Gemma Nano on Android) instead of Firebase.

### Document Vault (`src/components/DocumentScanner.tsx`)

- Accepts JPEG, PNG, and PDF uploads (max 20 MB)
- PDFs: `extractPdfContent` (pdfjs-dist) extracts the text layer; for image-based pages it
  renders each page to canvas and captures a PNG for OCR
- Text → `TokenVaultSession.tokenize()` → `analyzeDocumentText()` → Gemini
- Chat uses `chatWithDocument()` with tokenized context only

### Media Vault (`src/components/MediaVault.tsx`)

- Accepts audio (MP3/WAV/WebM/AAC/FLAC), images, video — max 25 MB
- Always uses cloud Gemini (`analyzeMediaFile`) — file sent once, not stored
- Follow-up chat masks PII before any cloud request

---

## Key Rules for Agents

1. **PREFER_ON_DEVICE everywhere** for text AI. Add `onDeviceParams` with
   `chromeModelOptions(false)` to every `getGenerativeModel` call. Cloud is the fallback, not
   the default.

2. **No `responseMimeType` in PREFER_ON_DEVICE calls.** Use plain text responses and parse
   JSON manually.

3. **TokenVault before every cloud call.** `vault.tokenize(text)` then
   `assertNoKnownLeak(tokenized.text, vault)` then cloud call.

4. **Branch workflow:** Push to `feat/vaultshield-app`, never to `master`. The user opens
   the PR. Never force-push.

5. **No Co-Authored-By attribution** in git commit messages.

6. **Private Diary is a real, maintained feature** — `PrivateDiary.tsx`, `DayMemoryCard.tsx`,
   `diaryStore.ts`, and `analyzeDiaryEntry` are live and sign-in-gated. (It was removed once
   then deliberately restored with real PIN-based encryption — don't re-delete it on sight.)
   It follows the same rules as everything else here: `analyzeDiaryEntry` must stay
   `PREFER_ON_DEVICE` with no `responseMimeType`, and must call `assertNoKnownLeak` on the
   tokenized entry before it can reach the cloud fallback.

7. **Brand teal** is `#0f766e`. Not `#0f4c75` (that's an off-brand navy).

---

## File Map (key files)

| Path | Purpose |
|---|---|
| `src/lib/firebase/ai.ts` | All Firebase AI / on-device inference calls |
| `src/lib/tokenVault.ts` | PII masking before cloud |
| `src/lib/firebase/config.ts` | Firebase init, `settings()` (model, mode) |
| `src/services/aiCapability.ts` | Chrome on-device availability / model options |
| `src/services/androidNano.ts` | Android Gemma Nano path |
| `src/components/DocumentScanner.tsx` | Document Vault UI + pipeline |
| `src/components/MediaVault.tsx` | Media Vault UI |
| `src/lib/pdfExtractor.ts` | pdfjs-dist wrapper for PDF → text / images |
| `src/lib/ai/documentPrompts.ts` | Document analysis prompts & types |
| `src/lib/router.ts` | Privacy routing logic |
| `android/` | Capacitor Android project |
| `.github/workflows/verify.yml` | CI: `npm ci` + `npm run build` only |
