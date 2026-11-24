import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("../src/lib/firebase/config", () => ({
  ai: {},
  settings: () => ({ model: "gemini-3.5-flash-lite", grounding: true }),
}));
import {
  optionalLocalSupport,
  translateFamilyGuidance,
  draftLocalReply,
  summarizeLocally,
  summarizeForFamily,
  proofreadReplyLocally,
  proofreaderAvailability,
  prepareLocalSpeech,
  startLocalDictation,
} from "../src/lib/firebase/ai";
import { maskIdentifiers } from "../src/lib/privacy";
beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("optional local AI boundary", () => {
  it.each(["hi", "ta", "mr"] as const)(
    "summarizes redacted text and translates locally into %s",
    async (language) => {
      const summaryDestroy = vi.fn();
      const translateDestroy = vi.fn();
      const summarize = vi
        .fn()
        .mockResolvedValue("The message demands urgent payment.");
      const translate = vi
        .fn()
        .mockResolvedValue("Translated summary 9876543210");
      const availability = vi.fn().mockResolvedValue("available");
      vi.stubGlobal("window", {
        Summarizer: {
          availability: vi.fn().mockResolvedValue("available"),
          create: vi
            .fn()
            .mockResolvedValue({ summarize, destroy: summaryDestroy }),
        },
        Translator: {
          availability,
          create: vi
            .fn()
            .mockResolvedValue({ translate, destroy: translateDestroy }),
        },
      });
      const text = maskIdentifiers("Pay now. Phone: 9876543210").text;
      const result = await summarizeForFamily(text, language);
      expect(summarize).toHaveBeenCalledWith(text);
      expect(translate).toHaveBeenCalledWith(
        "The message demands urgent payment.",
      );
      expect(availability).toHaveBeenCalledWith({
        sourceLanguage: "en",
        targetLanguage: language,
      });
      expect(result).toMatchObject({
        text: "Translated summary [REDACTED]",
        language,
        source: "ON_DEVICE",
        englishText: "The message demands urgent payment.",
      });
      expect(summaryDestroy).toHaveBeenCalledOnce();
      expect(translateDestroy).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("retains the English summary when local translation is unsupported", async () => {
    const create = vi.fn();
    vi.stubGlobal("window", {
      Summarizer: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi
          .fn()
          .mockResolvedValue({
            summarize: vi.fn().mockResolvedValue("Payment requested."),
            destroy: vi.fn(),
          }),
      },
      Translator: {
        availability: vi.fn().mockResolvedValue("unavailable"),
        create,
      },
    });
    expect(
      await summarizeForFamily(maskIdentifiers("Pay now.").text, "hi"),
    ).toMatchObject({
      language: "en",
      text: "Payment requested.",
      notice: expect.stringContaining("No cloud fallback"),
    });
    expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not prepare a translation model for an English summary", async () => {
    const create = vi.fn();
    vi.stubGlobal("window", {
      Summarizer: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi
          .fn()
          .mockResolvedValue({
            summarize: vi.fn().mockResolvedValue("Payment requested."),
            destroy: vi.fn(),
          }),
      },
      Translator: { availability: vi.fn(), create },
    });
    expect(
      await summarizeForFamily(maskIdentifiers("Pay now.").text, "en"),
    ).toMatchObject({ language: "en", text: "Payment requested." });
    expect(create).not.toHaveBeenCalled();
  });
  it("checks English proofreader availability without creating a session", async () => {
    const availability = vi.fn().mockResolvedValue("unavailable");
    const create = vi.fn();
    vi.stubGlobal("window", { Proofreader: { availability, create } });
    expect(await proofreaderAvailability()).toBe("unavailable");
    expect(availability).toHaveBeenCalledWith({
      expectedInputLanguages: ["en"],
    });
    await expect(proofreadReplyLocally("I has a question.")).rejects.toThrow(
      "does not support",
    );
    expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("translates safety guidance in a local session and releases it", async () => {
    const destroy = vi.fn();
    const translate = vi.fn().mockResolvedValue("रुकिए।");
    const availability = vi.fn().mockResolvedValue("available");
    vi.stubGlobal("window", {
      Translator: {
        availability,
        create: vi.fn().mockResolvedValue({ translate, destroy }),
      },
    });
    await expect(translateFamilyGuidance(["Pause."], "hi")).resolves.toEqual([
      "रुकिए।",
    ]);
    expect(availability).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "hi",
    });
    expect(translate).toHaveBeenCalledWith("Pause.");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("drafts from stage labels and masks generated contact details", async () => {
    const destroy = vi.fn();
    const write = vi.fn().mockResolvedValue("I will verify first. 9876543210");
    vi.stubGlobal("window", {
      Writer: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn().mockResolvedValue({ write, destroy }),
      },
    });
    await expect(draftLocalReply(["Urgency"])).resolves.toBe(
      "I will verify first. [REDACTED]",
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Urgency"));
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("reports missing APIs and fails without a network fallback", async () => {
    expect(optionalLocalSupport()).toEqual({
      writer: false,
      translator: false,
      summarizer: false,
      proofreader: false,
      speech: false,
    });
    await expect(
      summarizeLocally(maskIdentifiers("A clause").text),
    ).rejects.toThrow("not available");
    await expect(prepareLocalSpeech("en-IN")).rejects.toThrow("unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not invoke a summarizer whose device availability is unavailable", async () => {
    const factory = {
      availability: vi.fn().mockResolvedValue("unavailable"),
      create: vi.fn(),
    };
    vi.stubGlobal("window", { Summarizer: factory });
    await expect(
      summarizeLocally(maskIdentifiers("Some contract").text),
    ).rejects.toThrow("No cloud fallback");
    expect(factory.create).not.toHaveBeenCalled();
  });
  it("summarizes only the redacted input, reports actual download progress, and destroys the session", async () => {
    const session = {
      summarize: vi.fn().mockResolvedValue("Payment is due in 30 days."),
      destroy: vi.fn(),
    };
    const factory = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      create: vi.fn().mockImplementation((options) => {
        options.monitor({
          addEventListener: (
            _type: string,
            listener: (e: { loaded: number }) => void,
          ) => listener({ loaded: 0.5 }),
        });
        return Promise.resolve(session);
      }),
    };
    vi.stubGlobal("window", { Summarizer: factory });
    const progress = vi.fn();
    const text = maskIdentifiers(
      "Name: Anjali Sharma\nPayment due in 30 days.",
    ).text;
    const value = await summarizeLocally(text, progress);
    expect(session.summarize).toHaveBeenCalledWith(text);
    expect(progress).toHaveBeenCalledWith("Downloading summarizer: 50%");
    expect(value.source).toBe("ON_DEVICE");
    expect(session.destroy).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cleans up a failed proofreader session and does not modify the source draft", async () => {
    const session = {
      proofread: vi.fn().mockRejectedValue(new Error("Inference failed")),
      destroy: vi.fn(),
    };
    vi.stubGlobal("window", {
      Proofreader: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn().mockResolvedValue(session),
      },
    });
    const draft = "I has a question.";
    await expect(proofreadReplyLocally(draft)).rejects.toThrow(
      "Inference failed",
    );
    expect(draft).toBe("I has a question.");
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it("uses correctedInput for a proofread reply", async () => {
    const session = {
      proofread: vi
        .fn()
        .mockResolvedValue({ correctedInput: "I have a question." }),
      destroy: vi.fn(),
    };
    vi.stubGlobal("window", {
      Proofreader: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn().mockResolvedValue(session),
      },
    });
    expect((await proofreadReplyLocally("I has a question.")).text).toBe(
      "I have a question.",
    );
    expect(session.destroy).toHaveBeenCalledOnce();
  });
  it("rejects Hindi specialist input before creating an English-only model", async () => {
    await expect(proofreadReplyLocally("नमस्ते")).rejects.toThrow("English");
    await expect(
      summarizeLocally(maskIdentifiers("नमस्ते").text),
    ).rejects.toThrow("English");
  });
  it("refuses a legacy speech API that cannot guarantee local processing", async () => {
    class LegacySpeech {
      static available = vi.fn();
      static install = vi.fn();
      start = vi.fn();
    }
    vi.stubGlobal("window", { SpeechRecognition: LegacySpeech });
    await expect(prepareLocalSpeech("en-IN")).rejects.toThrow("Strictly local");
    expect(LegacySpeech.available).not.toHaveBeenCalled();
  });
  it("installs speech language packs only with processLocally true", async () => {
    class Speech {
      static available = vi.fn().mockResolvedValue("downloadable");
      static install = vi.fn().mockResolvedValue(true);
    }
    Object.defineProperty(Speech.prototype, "processLocally", { value: true });
    vi.stubGlobal("window", { SpeechRecognition: Speech });
    await prepareLocalSpeech("hi-IN");
    expect(Speech.available).toHaveBeenCalledWith({
      langs: ["hi-IN"],
      processLocally: true,
    });
    expect(Speech.install).toHaveBeenCalledWith({
      langs: ["hi-IN"],
      processLocally: true,
    });
  });
  it("never starts recognition while its local pack is unavailable", async () => {
    const start = vi.fn();
    class Speech {
      static available = vi.fn().mockResolvedValue("downloadable");
      static install = vi.fn();
      start = start;
    }
    Object.defineProperty(Speech.prototype, "processLocally", { value: true });
    vi.stubGlobal("window", { SpeechRecognition: Speech });
    await expect(
      startLocalDictation("en-IN", vi.fn(), vi.fn(), vi.fn()),
    ).rejects.toThrow("Prepare");
    expect(start).not.toHaveBeenCalled();
  });
  it("keeps microphone processing local and releases visibility listeners when stopped", async () => {
    vi.useFakeTimers();
    let instance: Speech;
    class Speech {
      static available = vi.fn().mockResolvedValue("available");
      static install = vi.fn();
      processLocally = true;
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      constructor() {
        instance = this;
      }
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
    }
    Object.defineProperty(Speech.prototype, "processLocally", {
      value: true,
      writable: true,
    });
    const doc = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", { SpeechRecognition: Speech });
    vi.stubGlobal("document", doc);
    const text = vi.fn();
    const handle = await startLocalDictation("en-IN", text, vi.fn(), vi.fn());
    expect(instance!.processLocally).toBe(true);
    instance!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "Please verify this." } }],
    });
    expect(text).toHaveBeenCalledWith("Please verify this.");
    handle.abort();
    expect(instance!.abort).toHaveBeenCalledOnce();
    expect(doc.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
