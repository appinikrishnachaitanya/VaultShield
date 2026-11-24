import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkStatus: vi.fn(),
  analyze: vi.fn(),
  cloudModel: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  registerPlugin: () => mocks,
}));
vi.mock("firebase/ai", () => ({
  getGenerativeModel: mocks.cloudModel,
  InferenceMode: {},
  InferenceSource: {},
}));
vi.mock("../src/lib/firebase/config", () => ({ ai: {}, settings: () => ({}) }));

import { checkWithLocalFallback } from "../src/lib/firebase/ai";

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
      text: expect.stringContaining(original),
      imageBase64: undefined,
    });
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });

  it("blocks screenshots on native scan error 606", async () => {
    await expect(checkWithLocalFallback(original, screenshot)).rejects.toThrow(
      "FEATURE_NOT_FOUND",
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
      "unavailable",
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.cloudModel).not.toHaveBeenCalled();
  });
});
