import { afterEach, expect, it, vi } from "vitest";
import {
  readWithLocalVoice,
  hasLocalVoice,
  subscribeLocalVoices,
} from "../src/lib/localVoice";
afterEach(() => vi.unstubAllGlobals());
it("only exposes read-aloud for an installed local voice matching the language", () => {
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  vi.stubGlobal("window", {
    speechSynthesis: {
      getVoices: () => [
        { lang: "hi-IN", localService: false },
        { lang: "en-US", localService: true },
      ],
    },
  });
  expect(hasLocalVoice("hi")).toBe(false);
  expect(hasLocalVoice("en")).toBe(true);
  expect(hasLocalVoice("ta")).toBe(false);
});
it("subscribes to delayed voice availability and removes its listener", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const refresh = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: { addEventListener, removeEventListener },
  });
  const stop = subscribeLocalVoices(refresh);
  expect(addEventListener).toHaveBeenCalledWith("voiceschanged", refresh);
  stop();
  expect(removeEventListener).toHaveBeenCalledWith("voiceschanged", refresh);
});
it("never uses a remote voice when a local language voice is missing", () => {
  const speak = vi.fn();
  const notify = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: {
      getVoices: () => [{ lang: "hi-IN", localService: false }],
      speak,
    },
  });
  readWithLocalVoice("नमस्ते", "hi", notify);
  expect(speak).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining("No installed local voice"),
  );
});
it("reads the summary using the actual output language's local voice", () => {
  const hindi = { lang: "hi-IN", localService: true };
  const speak = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: { getVoices: () => [hindi], cancel: vi.fn(), speak },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  readWithLocalVoice("रुकिए।", "hi", vi.fn());
  expect(speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: "रुकिए।", lang: "hi-IN", voice: hindi }),
  );
});
