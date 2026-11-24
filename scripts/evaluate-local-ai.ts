// Run only in a supported local Vite development browser. Never sends to cloud.
import { checkLocally } from "../src/lib/firebase/ai";
import { PRIVATE_SCAN_PROMPT_VERSION } from "../src/lib/ai/privateScanPrompt";
import cases from "../tests/fixtures/local-ai-evaluation.json";
export async function evaluateLocalAI(limit = 2, repeats = 1) {
  if (!import.meta.env.DEV) throw new Error("Evaluation is development-only.");
  const results: {
    id: string;
    run: number;
    predicted?: string[];
    expected?: string[];
    fullAI: boolean;
    passed: boolean;
    durationMs?: number;
    error?: string;
  }[] = [];
  // Sequential execution avoids competing sessions and excessive model memory.
  for (const sample of cases.slice(
    0,
    Math.max(1, Math.min(limit, cases.length)),
  )) {
    for (let run = 1; run <= Math.max(1, Math.min(3, repeats)); run++) {
      try {
        const result = await checkLocally(sample.text);
        const predicted = result.stages
          .filter((stage) => stage.found)
          .map((stage) => stage.name);
        const fullAI =
          result.source === "ON_DEVICE" &&
          result.stages.every((stage) => stage.assessedByAI);
        results.push({
          id: sample.id,
          run,
          predicted,
          expected: sample.expected,
          fullAI,
          passed:
            fullAI &&
            JSON.stringify([...predicted].sort()) ===
              JSON.stringify([...sample.expected].sort()),
          durationMs: result.durationMs,
        });
      } catch {
        results.push({
          id: sample.id,
          run,
          fullAI: false,
          passed: false,
          error: "LOCAL_CHECK_FAILED",
        });
      }
    }
  }
  const evaluated = results.filter((row) => row.fullAI);
  const tp = evaluated.reduce(
    (sum, row) =>
      sum +
      (row.predicted?.filter((x) => row.expected?.includes(x)).length ?? 0),
    0,
  );
  const fp = evaluated.reduce(
    (sum, row) =>
      sum +
      (row.predicted?.filter((x) => !row.expected?.includes(x)).length ?? 0),
    0,
  );
  const fn = evaluated.reduce(
    (sum, row) =>
      sum +
      (row.expected?.filter((x) => !row.predicted?.includes(x)).length ?? 0),
    0,
  );
  const completed = results.filter((row) => row.fullAI).length;
  return {
    promptVersion: PRIVATE_SCAN_PROMPT_VERSION,
    attempted: results.length,
    completed,
    passed: results.filter((row) => row.passed).length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    results,
  };
}
