import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkStatus: vi.fn(),
  analyze: vi.fn(),
  cloudModel: vi.fn(),
  verifyReviewed: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  registerPlugin: () => mocks,
}));
vi.mock("firebase/ai", () => ({
  getGenerativeModel: mocks.cloudModel,
  InferenceMode: {},
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
}));
vi.mock("../src/lib/firebase/config", () => ({
  ai: {},
  settings: () => ({ model: "gemini-3.5-flash-lite", grounding: true }),
}));

import {
  checkAndroidReviewedText,
  checkWithLocalFallback,
  verifyWithCloud,
  summarizeForFamily,
  proofreadReplyLocally,
} from "../src/lib/firebase/ai";

describe("Android model error 606", () => {
  const original = "Police: pay now and call 9876543210.";
  const screenshot = { data: "c3ludGhldGljLWltYWdl", mimeType: "image/png" };
  const unavailable = { status: "FEATURE_NOT_FOUND", errorCode: 606 };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkStatus.mockResolvedValue({ status: "READY" });
    mocks.analyze.mockResolvedValue(unavailable);
  });

  it("falls back to masked text when the native scan returns 606", async () => {
    const result = await checkWithLocalFallback(original);
    expect(result).toMatchObject({
      source: "LOCAL_RULES",
      text: "Police: pay now and call [REDACTED].",
    });
    expect(mocks.analyze).toHaveBeenCalledWith({
      text: expect.stringContaining("Police: pay now and call [REDACTED]."),
      imageBase64: undefined,
    });
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });

  it("blocks screenshots on native scan error 606", async () => {
    await expect(checkWithLocalFallback(original, screenshot)).rejects.toThrow(
      "This device cannot read screenshots privately yet",
    );
    expect(mocks.analyze).toHaveBeenCalledWith({
      text: expect.any(String),
      imageBase64: screenshot.data,
    });
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });

  it("uses the same privacy rules when model preparation returns 606", async () => {
    mocks.checkStatus.mockResolvedValue(unavailable);
    await expect(checkWithLocalFallback(original)).resolves.toMatchObject({
      source: "LOCAL_RULES",
    });
    await expect(checkWithLocalFallback(original, screenshot)).rejects.toThrow(
      "This device cannot read screenshots privately yet",
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
});

describe("native Firebase reviewed-text boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
  });
  it.each(["ON_DEVICE", "IN_CLOUD"] as const)(
    "uses native SDK source %s without a Chrome adapter or local availability gate",
    async (source) => {
      mocks.checkStatus.mockResolvedValue({ status: "UNAVAILABLE" });
      mocks.verifyReviewed.mockResolvedValue({
        status: "READY",
        text: "Verify independently.",
        source,
      });
      const result = await verifyWithCloud(
        "Please pay now." as import("../src/types/privacy").SanitizedText,
        true,
        undefined,
        "hybrid",
        "hi",
      );
      expect(result.source).toBe(source);
      expect(mocks.verifyReviewed).toHaveBeenCalledWith(
        expect.objectContaining({
          consent: true,
          purpose: "hybrid",
          model: "gemini-3.5-flash-lite",
          prompt: expect.stringContaining("simple Hindi"),
        }),
      );
      const prompt = mocks.verifyReviewed.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("इन हिंदी शीर्षकों का उपयोग करें");
      expect(prompt).not.toContain(
        "Use three sections: What this means",
      );
      expect(mocks.checkStatus).not.toHaveBeenCalled();
      expect(mocks.cloudModel).not.toHaveBeenCalled();
    },
  );
  it("does not cross the native hybrid boundary without explicit consent", async () => {
    await expect(
      verifyWithCloud(
        "Please pay now." as import("../src/types/privacy").SanitizedText,
        false,
      ),
    ).rejects.toThrow("permission");
    expect(mocks.verifyReviewed).not.toHaveBeenCalled();
  });
  it("runs the Android primary pressure analysis through PREFER hybrid after redacted-text consent", async () => {
    const approved =
      "Police asked me to pay now. Phone: [REDACTED]." as import("../src/types/privacy").SanitizedText;
    mocks.verifyReviewed.mockResolvedValue({
      status: "READY",
      text: JSON.stringify({
        redactedText: approved,
        stages: {
          Authority: "Police",
          Fear: "",
          Urgency: "pay now",
          Secrecy: "",
        },
      }),
      source: "IN_CLOUD",
      durationMs: 3210,
    });
    const result = await checkAndroidReviewedText(approved, true);
    expect(result).toMatchObject({
      source: "IN_CLOUD",
      durationMs: 3210,
      stages: [
        { name: "Authority", found: true, assessmentSource: "IN_CLOUD" },
        { name: "Fear", found: false, assessmentSource: "IN_CLOUD" },
        { name: "Urgency", found: true, assessmentSource: "IN_CLOUD" },
        { name: "Secrecy", found: false, assessmentSource: "IN_CLOUD" },
      ],
    });
    expect(mocks.verifyReviewed).toHaveBeenCalledWith(
      expect.objectContaining({
        consent: true,
        purpose: "hybrid",
        model: "gemini-3.5-flash-lite",
        prompt: expect.stringContaining("Phone: [REDACTED]"),
      }),
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
  it("rejects identifiers even if a caller forges the branded TypeScript type", async () => {
    await expect(
      verifyWithCloud(
        "Call 9876543210 now." as import("../src/types/privacy").SanitizedText,
        true,
      ),
    ).rejects.toThrow("redacted text");
    expect(mocks.verifyReviewed).not.toHaveBeenCalled();
  });
  it("preserves native grounding metadata for explicitly approved public-source checking", async () => {
    const metadata = {
      groundingChunks: [{ web: { uri: "https://pib.gov.in/", title: "PIB" } }],
    };
    mocks.verifyReviewed.mockResolvedValue({
      status: "READY",
      text: "Check this source.",
      source: "IN_CLOUD",
      metadata,
    });
    const result = await verifyWithCloud(
      "Please pay now." as import("../src/types/privacy").SanitizedText,
      true,
      undefined,
      "public-sources",
    );
    expect(result.metadata).toEqual(metadata);
    expect(mocks.verifyReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "public-sources" }),
    );
  });
  it("does not invent a source badge when the native SDK fails or omits it", async () => {
    mocks.verifyReviewed.mockResolvedValue({
      status: "READY",
      text: "Unknown source.",
    });
    await expect(
      verifyWithCloud(
        "Please pay now." as import("../src/types/privacy").SanitizedText,
        true,
      ),
    ).rejects.toThrow("Verification could not complete");
  });
  it("routes Android Maa summaries through consented Firebase hybrid AI and keeps reply polishing local", async () => {
    mocks.analyze.mockResolvedValue({
      status: "READY",
      text: "I will check this.",
    });
    mocks.verifyReviewed.mockResolvedValue({
      status: "READY",
      text: "रुकें और स्वतंत्र रूप से पुष्टि करें।",
      source: "IN_CLOUD",
      durationMs: 4321,
    });
    const text =
      "Please pay now." as import("../src/types/privacy").SanitizedText;
    expect(
      await summarizeForFamily(text, "hi", undefined, "en", true),
    ).toMatchObject({
      language: "hi",
      source: "IN_CLOUD",
      durationMs: 4321,
      text: "रुकें और स्वतंत्र रूप से पुष्टि करें।",
    });
    await proofreadReplyLocally("I will check this.");
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.verifyReviewed).toHaveBeenCalledOnce();
    expect(mocks.verifyReviewed.mock.calls[0][0]).toMatchObject({
      consent: true,
      purpose: "hybrid",
    });
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
  it("does not send an Android summary without explicit cloud-fallback approval", async () => {
    const text =
      "Please pay now." as import("../src/types/privacy").SanitizedText;
    await expect(summarizeForFamily(text, "hi")).rejects.toThrow(
      "permission",
    );
    expect(mocks.verifyReviewed).not.toHaveBeenCalled();
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
  it("reports a failed approved hybrid summary without a second provider path", async () => {
    mocks.analyze.mockResolvedValue({ status: "FEATURE_NOT_FOUND" });
    mocks.verifyReviewed.mockRejectedValue(new Error("Firebase request failed"));
    await expect(
      summarizeForFamily(
        "Please pay now." as import("../src/types/privacy").SanitizedText,
        "hi",
        undefined,
        "en",
        true,
      ),
    ).rejects.toThrow("Firebase request failed");
    expect(mocks.verifyReviewed).toHaveBeenCalledOnce();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
});
