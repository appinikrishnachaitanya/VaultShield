# VaultShield fixes — 24 November 2026

## Confirmed cause
Chrome completed Gemma 4 CPU inference with three tactic entries. The adapter rejected the entire answer because Secrecy was absent. That run was a parser failure, not a generation timeout. The earlier first-attempt availability failure was transient; its precise browser cause was not captured.

## Implemented contract
- Firebase AI Logic ONLY_ON_DEVICE with a compact responseConstraint schema for the private scan.
- Accept compact objects and legacy arrays. Preserve valid AI findings independently of missing/malformed categories.
- Missing categories are labeled not assessed by AI and checked separately using labeled LOCAL RULES. They never become negative AI findings.
- Pre-mask known identifiers, re-mask generated evidence, and require the SDK's actual local inference source.
- Keep screenshots local; failures never upload the image.
- Extend browser availability probing to 30 seconds, retry a rejected probe once within that bound, and distinguish a timed-out probe.
- Skip redundant explicit model initialization when available; measure preparation and generation separately. Explain slow CPU inference.
- Keep features discoverable with runtime capability checks rather than blanket gates.
- Require redacted-text review and consent; editing clears consent.
- Backend rejects extra fields without echoing content and stores only tacticCount, tacticTypes, timestamp, familyCircleId and status for alerts.
- Transactional limits cover alerts, invites, joins and token registration; notification fanout is bounded.

## Verification
95 web tests and 10 mocked backend tests pass; production TypeScript/Vite/PWA build passes. Tests include the exact missing-category regression, malformed partial output, a cold 12-second availability response, native 606 fallback, redaction variants and Firebase SDK cloud payload privacy with mocked transport.

Manual production-preview checks confirmed masked text, explicit provenance, editing resets consent, and failure preserves the private result. Hosted checks confirmed normal-message zero rule matches, review controls and graceful cloud failure. The real hosted cloud attempt returned quota unavailable (429), not a successful verification. This automation browser does not expose working Chrome local inference, so successful hosted AI must be checked in the user's model-enabled Chrome profile.

## Deployment
Corrected web build deployed to https://vaultshield-2ace9.web.app . Updated Python backend still requires a separate Cloud Run redeploy. The client accepts both legacy and new inbox records during rollout; requests remain compatible with the previous backend.

## Live acceptance still pending
Successful hosted AI in model-enabled Chrome; capable-device screenshot inference; successful real cloud response after quota recovery; two-session family pairing and FCM; supported-device Android inference and attestation. No simulated verification substitutes for these checks.
