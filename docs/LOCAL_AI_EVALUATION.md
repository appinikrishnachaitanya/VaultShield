# Private model evaluation — pressure-v2

The unit tests validate plumbing and response handling. They are NOT evidence of Nano/Gemma classification accuracy. The 24 synthetic cases in tests/fixtures/local-ai-evaluation.json are a separate evaluation set; do not copy them into the few-shot prompt. Labels describe pressure tactics, not whether a request is fraudulent. Human reviewers should review disagreements, especially contractual wording and authority claims.

## Run the actual model

1. Run `npm run dev` and open the app in the desktop Chrome profile with a ready local model.
2. Open DevTools on that local page. To run two neutral messages first:

```js
const { evaluateLocalAI } = await import('/scripts/evaluate-local-ai.ts');
const smoke = await evaluateLocalAI(2, 1);
console.table(smoke.results);
```

3. Only after both are completed by AI and correct, run the full suite:

```js
const report = await evaluateLocalAI(24, 3);
console.table(report.results);
console.log(report);
```

The runner calls the real `checkLocally` through Firebase AI Logic ONLY_ON_DEVICE; it does not substitute fixture answers, call the cloud or accept LOCAL RULES as an AI pass. It runs sequentially, with no retries beyond the requested repetitions (maximum three). On CPU, a full run can take many minutes. Report data includes synthetic case IDs, labels and timings, not message content. It does not store or transmit results. Repeat separately for each browser/model/device and record the actual model from chrome://on-device-internals; do not infer Nano versus Gemma from the SDK.

## Release gate

- The reported normal-delivery false-positive regression must return zero tactics in all three actual-model runs.
- Every case must complete entirely with AI; partial/rules-assisted output is not an AI accuracy pass.
- Review per-category false positives and false negatives, plus precision/recall and completion rate. The small set is a regression gate, not a production accuracy estimate.
- A parser can check JSON structure and quote provenance, but cannot prove a quoted sentence demonstrates fear or authority. Incorrect semantics must remain a failed model test; do not whitelist the exact test message.
- Compare the old and new prompt on the same model/device if measuring improvement. Never call a prompt 'best' solely because unit tests passed.
- Add new failures to the held-out set before considering further prompt changes.

## Additional manual directions

Check English/Hindi/Hinglish, source-preserving redaction, empty/blurred screenshots, ordinary receipts, threatening fake invoices, ordinary OTP expiry, secrecy versus password hygiene, malicious in-message instructions, truncated JSON, omitted categories, invented evidence, names/IDs/UPI, offline warm-model inference and a cold start. Screenshot/OCR evaluation is separate from text classification; human reviewers must compare the extracted text to the image. Never upload a private screenshot for benchmark convenience.

## Sources used

- https://firebase.google.com/docs/ai-logic/prompt-design
- https://ai.google.dev/gemini-api/docs/prompting-strategies
- https://developer.chrome.com/docs/ai/structured-output-for-prompt-api
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

## Current validation status

Automated parser/privacy/UI regressions: run with `npm test`.
Real local-model classification evaluation: NOT YET VERIFIED for pressure-v2. Run the commands above on supported Chrome; no model accuracy is claimed from mocked tests.
