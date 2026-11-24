import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/lib/firebase/config", async () => {
  const { initializeApp } = await import("firebase/app");
  const { getAI, VertexAIBackend } = await import("firebase/ai");
  const app = initializeApp(
    {
      projectId: "demo-vaultshield",
      apiKey: "mock-firebase-api-key",
      appId: "1:123:web:test",
    },
    "cloud-payload-test",
  );
  return {
    ai: getAI(app, { backend: new VertexAIBackend() }),
    settings: () => ({ model: "gemini-3.5-flash-lite", grounding: true }),
  };
});

import {
  checkWithLocalFallback,
  verifyWithCloud,
} from "../src/lib/firebase/ai";
import { maskIdentifiers } from "../src/lib/privacy";

afterEach(() => vi.unstubAllGlobals());

it.each(["hybrid", "public-sources"] as const)(
  "sends only reviewed redacted evidence in a real SDK %s request",
  async (purpose) => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: true });
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ text: "Verify separately." }],
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const privateValues = [
      "9876543210",
      "qa-wallet@upi",
      "1234 5678 9012",
      "ABCDE1234F",
    ];
    const original = `Police: pay now. ${privateValues.join("; ")} Unreviewed suffix.`;
    const result = await checkWithLocalFallback(original);
    expect(result.source).toBe("LOCAL_RULES");
    const reviewed = maskIdentifiers(
      result.text.replace(" Unreviewed suffix.", ""),
    ).text;

    await expect(
      verifyWithCloud(reviewed, false, undefined, purpose),
    ).rejects.toThrow("permission");
    expect(fetchSpy).not.toHaveBeenCalled();

    await expect(
      verifyWithCloud(reviewed, true, undefined, purpose),
    ).resolves.toMatchObject({
      source: "IN_CLOUD",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, request] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(request.body));
    if (purpose === "public-sources")
      expect(body.tools).toEqual([{ googleSearch: {} }]);
    else expect(body.tools).toBeUndefined();
    const parts = body.contents.flatMap(
      (content: { parts: object[] }) => content.parts,
    );
    expect(parts).toEqual([
      {
        text: expect.stringContaining(`Evidence: ${JSON.stringify(reviewed)}`),
      },
    ]);
    for (const secret of [...privateValues, original, "Unreviewed suffix."]) {
      expect(request.body).not.toContain(secret);
    }
  },
);
