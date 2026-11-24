# VaultShield regression test plan

Treat synthetic messages as private input. No test sends a live Gemini request.

| Risk                                      | Automated check                                 | Pass condition                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Basic check exposes Indian identifiers    | Vitest, LOCAL RULES                             | Mask phone, UPI, Aadhaar and PAN in the returned text and stage evidence.                                                               |
| Cloud verification forwards the original  | Vitest, real Firebase SDK with fetch stub       | Denied consent makes zero requests. An approved request carries the reviewed redacted text, no original identifiers and no image parts. |
| Android model 606 breaks the private scan | Vitest, Capacitor bridge mock                   | FEATURE_NOT_FOUND/606 falls back to rules for text and rejects screenshots without calling Firebase cloud.                              |
| Existing behavior regresses               | Full Vitest and Python suites                   | Preserve local tools, consent, source labels, family pairing and alert tests.                                                           |
| APK or app identity regresses             | Android JVM and connected instrumentation tests | Build the test APKs and verify the installed target package.                                                                            |

For a live release smoke test, use synthetic input to verify Chrome Nano inference offline, consented cloud fallback online, and Android sharing and fallback on a connected device. On-device generation needs a supported device with a ready model. Mocked cloud and Capacitor tests establish application behavior, not live model availability.

## Product review regression (24 November 2026)

Latest deeper recheck: 52 frontend tests and seven mocked backend tests passed; production PWA build passed. Added regression coverage for labeled short accounts, alphanumeric payment references, Unicode highlight offsets, and a hung Chrome availability probe. Rapid duplicate tasks are guarded and the consent dialog makes background controls inert. Live browser checks confirmed account/reference redaction, four tactic matches for the synthetic threat, zero common pressure matches for normal delivery, dialog focus isolation, matching 52px primary/basic button heights, no horizontal overflow, and no React render errors. The running frontend and its JavaScript entry returned HTTP 200 at `http://127.0.0.1:5173/`. Preview: `artifacts/qa/final-recheck.jpg`. Live external integration limitations below still apply.

- `npm test`: 48 tests across six files passed. Covers local-only privacy, both consented outbound SDK routes, public-source provenance, Proofreader cancellation recovery, fabricated masking counts, and literal evidence highlighting with HTML escaping.
- Python family API suite: seven tests passed with Firebase Admin mocked; this does not prove notification delivery.
- Production TypeScript/Vite/PWA build passed.
- In-app browser: synthetic digital-arrest rules check, four tactic highlights, redacted preview, trusted-contact guidance, collapsed optional tools, route-change consent reset and text-edit consent reset verified. No live cloud request or family alert was sent in this review.
- Mobile viewport: no horizontal document overflow; primary/basic check and Maa Mode actions measured 52px high with equal widths inside their groups. Desktop preview checked. Screenshots: `artifacts/qa/review-mobile.jpg` and `artifacts/qa/review-desktop.jpg`.
- Still pending live acceptance: screenshot local inference on the user's compatible Chrome, authorized cloud success with a registered App Check token, two-person FCM delivery, offline reopening of the deployed PWA, Android inference/eligibility.
