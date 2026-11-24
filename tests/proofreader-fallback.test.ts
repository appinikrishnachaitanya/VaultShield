import { afterEach, describe, expect, it, vi } from "vitest";
import { getGenerativeModel, InferenceMode, InferenceSource } from "firebase/ai";
import { chromeAvailability } from "../src/services/aiCapability";
import { proofreadReplyLocally } from "../src/lib/firebase/ai";

vi.mock("../src/lib/firebase/config", () => ({
  ai: {}, settings: () => ({ model: "gemini-3.5-flash-lite" }),
}));
vi.mock("../src/services/aiCapability", async (original) => ({
  ...await original<typeof import("../src/services/aiCapability")>(),
  chromeAvailability: vi.fn(),
}));
vi.mock("firebase/ai", async (original) => ({
  ...await original<typeof import("firebase/ai")>(),
  getGenerativeModel: vi.fn(),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Proofreader cancellation recovery", () => {
  function cancelledSpecialist() {
    const destroy = vi.fn();
    vi.stubGlobal("window", { Proofreader: {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ destroy,
        proofread: vi.fn().mockRejectedValue(new DOMException("The request was cancelled.", "AbortError")),
      }),
    } });
    return destroy;
  }
  it("releases the specialist then uses only Firebase on-device inference", async () => {
    const destroy = cancelledSpecialist();
    vi.mocked(chromeAvailability).mockResolvedValue("available");
    const generateContent = vi.fn().mockImplementation(async () => {
      expect(destroy).toHaveBeenCalledOnce();
      return { response: { inferenceSource: InferenceSource.ON_DEVICE, text: () => "I have a question." } };
    });
    vi.mocked(getGenerativeModel).mockReturnValue({ generateContent } as never);
    const result = await proofreadReplyLocally("I has a question.");
    expect(result.text).toBe("I have a question.");
    expect(result.engine).toBe("Firebase on-device");
    expect(getGenerativeModel).toHaveBeenCalledWith({}, expect.objectContaining({ mode: InferenceMode.ONLY_ON_DEVICE }));
  });
  it("does not invoke Firebase when the desktop model is unavailable", async () => {
    cancelledSpecialist();
    vi.mocked(chromeAvailability).mockResolvedValue("unavailable");
    await expect(proofreadReplyLocally("I has a question.")).rejects.toThrow("Your draft is unchanged");
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });
  it("refuses a fallback result that is not marked on-device", async () => {
    cancelledSpecialist();
    vi.mocked(chromeAvailability).mockResolvedValue("available");
    vi.mocked(getGenerativeModel).mockReturnValue({ generateContent: vi.fn().mockResolvedValue({ response: {
      inferenceSource: InferenceSource.IN_CLOUD, text: () => "Must not display",
    } }) } as never);
    await expect(proofreadReplyLocally("I has a question.")).rejects.toThrow("Your draft is unchanged");
  });
});
