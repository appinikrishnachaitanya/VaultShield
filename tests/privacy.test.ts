import { describe, it, expect, vi, beforeEach } from "vitest";
import { maskIdentifiers } from "../src/lib/privacy";
import { chromeAvailability } from "../src/services/aiCapability";
const mocks = vi.hoisted(() => ({ generateContent: vi.fn(), model: vi.fn() }));
vi.mock("firebase/ai", () => ({
  getGenerativeModel: mocks.model,
  InferenceMode: {
    ONLY_ON_DEVICE: "only_on_device",
    PREFER_ON_DEVICE: "prefer_on_device",
    ONLY_IN_CLOUD: "only_in_cloud",
  },
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
}));
vi.mock("../src/lib/firebase/config", () => ({
  ai: {},
  settings: () => ({ model: "gemini-3.5-flash-lite", grounding: true }),
}));
import {
  checkLocally,
  checkTextWithLocalRules,
  checkWithLocalFallback,
  verifyWithCloud,
} from "../src/lib/firebase/ai";
beforeEach(() => {
  mocks.model.mockReset();
  mocks.generateContent.mockReset();
  mocks.model.mockReturnValue({
    generateContent: mocks.generateContent,
    initializeDeviceModel: vi.fn().mockResolvedValue(undefined),
  });
  vi.stubGlobal("navigator", {
    onLine: true,
    userAgent: "Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36",
  });
  vi.stubGlobal("window", {
    LanguageModel: {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn(),
    },
  });
});
describe("privacy firewall", () => {
  it.each(["", "[REDACTED]"])(
    "keeps an unreadable screenshot as an incomplete check, not a safe result: %s",
    async (redactedText) => {
      mocks.generateContent.mockResolvedValue({
        response: {
          inferenceSource: "on_device",
          text: () =>
            JSON.stringify({
              redactedText,
              stages: {
                Authority: "CBI",
                Fear: "arrest",
                Urgency: "pay now",
                Secrecy: "secret",
              },
              imageMismatches: ["invented mismatch"],
            }),
        },
      });
      const result = await checkLocally("", {
        data: "AA==",
        mimeType: "image/png",
      });
      expect(result.source).toBe("ON_DEVICE");
      expect(result.text).toBe(redactedText);
      expect(
        result.stages.every(
          (stage) => !stage.found && stage.assessedByAI === false,
        ),
      ).toBe(true);
      expect(result.imageMismatches).toBeUndefined();
    },
  );
  it.each(["hybrid", "public-sources"] as const)(
    "blocks placeholder-only verification before the %s SDK model exists",
    async (purpose) => {
      await expect(
        verifyWithCloud(
          maskIdentifiers("[REDACTED]").text,
          true,
          undefined,
          purpose,
        ),
      ).rejects.toThrow("No readable message");
      expect(mocks.model).not.toHaveBeenCalled();
      expect(mocks.generateContent).not.toHaveBeenCalled();
    },
  );

  it("allows a cold Chrome availability check longer than the former ten-second limit", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(
        (
          window as unknown as {
            LanguageModel: { availability: ReturnType<typeof vi.fn> };
          }
        ).LanguageModel.availability,
      ).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve("available"), 12000),
          ),
      );
      const pending = chromeAvailability(false, true);
      await vi.advanceTimersByTimeAsync(12000);
      expect(await pending).toBe("available");
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains valid findings when a different category is malformed", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText: "Police: pay now.",
            stages: [
              { name: "Authority", found: true, evidence: "Police" },
              { name: "Fear", found: "false", evidence: 42 },
            ],
          }),
      },
    });
    const result = await checkLocally("Police: pay now.");
    expect(result.source).toBe("ON_DEVICE");
    expect(
      result.stages.find((s) => s.name === "Authority")?.assessedByAI,
    ).toBe(true);
    expect(result.stages.find((s) => s.name === "Fear")?.assessedByAI).toBe(
      false,
    );
  });
  it("preserves a completed three-stage AI response and labels the missing stage as rules", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText:
              "CBI: pay within 10 minutes. Do not tell your family.",
            stages: ["Authority", "Fear", "Urgency"].map((name) => ({
              name,
              found: true,
              evidence: name === "Authority" ? "CBI" : "pay within 10 minutes",
            })),
          }),
      },
    });
    const result = await checkWithLocalFallback(
      "CBI: pay within 10 minutes. Do not tell your family.",
    );
    expect(result.source).toBe("ON_DEVICE");
    expect(result.ruleAssisted).toBe(true);
    expect(result.stages.find((s) => s.name === "Authority")).toMatchObject({
      assessedByAI: true,
      assessmentSource: "ON_DEVICE",
    });
    expect(result.stages.find((s) => s.name === "Secrecy")).toMatchObject({
      found: true,
      assessedByAI: false,
      assessmentSource: "LOCAL_RULES",
    });
    expect(result.generationMs).toBeGreaterThanOrEqual(0);
  });
  it("does not turn a missing AI assessment into a negative AI finding", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText: "Your parcel arrives today.",
            stages: { Authority: "" },
          }),
      },
    });
    const result = await checkLocally("Your parcel arrives today.");
    expect(result.stages.find((s) => s.name === "Secrecy")).toMatchObject({
      found: false,
      assessedByAI: false,
      assessmentSource: "LOCAL_RULES",
    });
    expect(result.source).toBe("ON_DEVICE");
    expect(
      mocks.model.mock.calls[0][1].onDeviceParams.promptOptions
        .responseConstraint,
    ).toBeDefined();
    expect(
      mocks.model.mock.results[0].value.initializeDeviceModel,
    ).not.toHaveBeenCalled();
  });

  it("accepts local JSON fenced with surrounding whitespace instead of falling back", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          "\n  ```json\n" +
          JSON.stringify({
            redactedText: "Call [REDACTED].",
            stages: ["Authority", "Fear", "Urgency", "Secrecy"].map((name) => ({
              name,
              found: false,
              evidence: "",
            })),
          }) +
          "\n```  \n",
      },
    });
    expect(await checkWithLocalFallback("Call 9876543210.")).toMatchObject({
      source: "ON_DEVICE",
      text: "Call [REDACTED].",
    });
  });
  it("reports cancellation safely without repeating private SDK error contents", async () => {
    mocks.generateContent.mockRejectedValue(
      new DOMException(
        "Request was cancelled: secret-original-9876543210",
        "AbortError",
      ),
    );
    const result = await checkWithLocalFallback("Call 9876543210.");
    expect(result.fallbackReason).toContain("cancelled");
    expect(JSON.stringify(result)).not.toContain("secret-original");
    expect(JSON.stringify(result)).not.toContain("9876543210");
  });
  it("masks labeled short accounts and alphanumeric payment references", () => {
    const result = maskIdentifiers(
      "Account no: 12345678\nA/c: 4567 1234\nUTR: HDFC1234567890\nTransaction ID: TXN34567890\nPay within 10 minutes.",
    );
    expect(result.text).toBe(
      "Account no: [REDACTED]\nA/c: [REDACTED]\nUTR: [REDACTED]\nTransaction ID: [REDACTED]\nPay within 10 minutes.",
    );
    expect(result.count).toBe(4);
  });
  it("rejects an unredacted account before creating a verifier", async () => {
    await expect(
      verifyWithCloud(
        "Account: 12345678" as ReturnType<typeof maskIdentifiers>["text"],
        true,
      ),
    ).rejects.toThrow("redacted");
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("bounds an unresponsive Chrome availability probe without starting inference", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("window", {
        LanguageModel: {
          create: vi.fn(),
          availability: vi.fn(() => new Promise(() => {})),
        },
      });
      const pending = chromeAvailability(false);
      await vi.advanceTimersByTimeAsync(30000);
      expect(await pending).toBe("unavailable");
      expect(mocks.model).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("counts visible redactions instead of trusting an invented model count", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText: "Call [REDACTED].",
            maskedCount: 9999,
            stages: ["Authority", "Fear", "Urgency", "Secrecy"].map((name) => ({
              name,
              found: false,
              evidence: "",
            })),
          }),
      },
    });
    expect((await checkLocally("Call 9876543210.")).masked).toBe(1);
  });
  it("keeps the basic fallback local and identifies pressure without exposing the phone number", () => {
    const result = checkTextWithLocalRules(
      "Police: pay now or you will be arrested. Do not tell anyone. Call 9876543210.",
    );
    expect(result.source).toBe("LOCAL_RULES");
    expect(result.text).not.toContain("9876543210");
    expect(result.stages.every((stage) => stage.found)).toBe(true);
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("masks Indian phone, UPI, Aadhaar, and PAN on the LOCAL RULES path", () => {
    const identifiers = [
      "+91 98765 43210",
      "qa-wallet@upi",
      "1234 5678 9012",
      "ABCDE1234F",
    ];
    const result = checkTextWithLocalRules(
      `Police: pay now. ${identifiers.join("; ")}`,
    );
    expect(result.source).toBe("LOCAL_RULES");
    expect(result.masked).toBe(4);
    expect(result.text).toBe(
      "Police: pay now. [REDACTED]; [REDACTED]; [REDACTED]; [REDACTED]",
    );
    for (const identifier of identifiers) {
      expect(JSON.stringify(result)).not.toContain(identifier);
    }
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it.each(["98765 43210", "98765-43210", "+919876543210"])(
    "masks the entire formatted phone number %s",
    (phone) => {
      expect(checkTextWithLocalRules(`Call ${phone} now.`).text).toBe(
        "Call [REDACTED] now.",
      );
    },
  );

  it("falls back to local rules for text and refuses to route screenshots", async () => {
    vi.stubGlobal("window", {});
    const result = await checkWithLocalFallback("Police: pay now.");
    expect(result.source).toBe("LOCAL_RULES");
    await expect(
      checkWithLocalFallback("Police: pay now.", {
        data: "AA==",
        mimeType: "image/png",
      }),
    ).rejects.toThrow("Nothing was sent");
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("does not send content when local model preparation fails", async () => {
    vi.mocked(
      (
        window as unknown as {
          LanguageModel: { availability: ReturnType<typeof vi.fn> };
        }
      ).LanguageModel.availability,
    ).mockResolvedValue("downloadable");
    mocks.model.mockReturnValue({
      initializeDeviceModel: vi
        .fn()
        .mockRejectedValue(new Error("Model unavailable")),
      generateContent: mocks.generateContent,
    });
    await expect(checkLocally("private input")).rejects.toThrow(
      "Model unavailable",
    );
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
  it("blocks before any SDK request when the browser local API is missing", async () => {
    vi.stubGlobal("window", {});
    await expect(checkLocally("private original text")).rejects.toThrow(
      "Nothing was sent",
    );
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
  it("masks Indian identifiers, email and UPI without exposing Aadhaar suffixes", () => {
    const { text, count } = maskIdentifiers(
      "Name: Anjali Sharma\n1234 5678 4521 9876543210 person@example.com helper@upi ABCDE1234F",
    );
    expect(count).toBe(6);
    expect(text).not.toMatch(/Anjali|4521|9876543210|person@|helper@|ABCDE/);
  });
  it("masks links, IFSC, OTPs, and currency amounts before review", () => {
    const { text, count } = maskIdentifiers(
      "https://example.com/private SBIN0001234 OTP is 123456 ₹1,200",
    );
    expect(count).toBe(4);
    expect(text).toBe("[REDACTED] [REDACTED] [REDACTED] [REDACTED]");
  });
  it("leaves ordinary delivery text intact", () => {
    const value = "Your parcel arrives today. No payment required.";
    expect(maskIdentifiers(value).text).toBe(value);
  });
  it("fails closed if SDK returns a cloud source during a local check", async () => {
    mocks.generateContent.mockResolvedValue({
      response: { inferenceSource: "in_cloud" },
    });
    await expect(checkLocally("secret")).rejects.toThrow("Privacy boundary");
    expect(mocks.model.mock.calls[0][1]).toMatchObject({
      mode: "only_on_device",
      inCloudParams: { model: "gemini-3.5-flash-lite" },
    });
  });
  it("opts into SDK fallback only for approved text and reports SDK provenance", async () => {
    const text = maskIdentifiers("Call 9876543210 and pay now.").text;
    await expect(verifyWithCloud(text, false)).rejects.toThrow("permission");
    expect(mocks.model).not.toHaveBeenCalled();
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "in_cloud",
        text: () => "Verify independently.",
      },
    });
    expect(await verifyWithCloud(text, true)).toMatchObject({
      source: "IN_CLOUD",
    });
    expect(mocks.model).toHaveBeenCalledTimes(1);
    expect(mocks.model.mock.calls[0][1]).toMatchObject({
      mode: "prefer_on_device",
      inCloudParams: {
        model: "gemini-3.5-flash-lite",
        tools: undefined,
      },
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(mocks.generateContent.mock.calls[0][0]).not.toContain("9876543210");
  });
  it("lets the same verification call run locally while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () => "Call the bank independently.",
      },
    });
    const result = await verifyWithCloud(
      maskIdentifiers("Account blocked.").text,
      true,
    );
    expect(result).toMatchObject({ source: "ON_DEVICE", metadata: undefined });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
  it("uses cloud-only grounding only after explicit public-source approval", async () => {
    const text = maskIdentifiers("CBI officer: pay now. Call 9876543210.").text;
    await expect(
      verifyWithCloud(text, false, undefined, "public-sources"),
    ).rejects.toThrow("permission");
    expect(mocks.model).not.toHaveBeenCalled();
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "in_cloud",
        text: () => "Evidence is inconclusive.",
      },
    });
    expect(
      await verifyWithCloud(text, true, undefined, "public-sources"),
    ).toMatchObject({
      source: "IN_CLOUD",
      purpose: "public-sources",
      model: "gemini-3.5-flash-lite",
    });
    expect(mocks.model.mock.calls[0][1]).toMatchObject({
      mode: "only_in_cloud",
      inCloudParams: { tools: [{ googleSearch: {} }] },
    });
    expect(mocks.generateContent.mock.calls[0][0]).not.toContain("9876543210");
  });
  it("preserves the private result by rejecting an offline public-source request before SDK use", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(
      verifyWithCloud(
        maskIdentifiers("Check this claim.").text,
        true,
        undefined,
        "public-sources",
      ),
    ).rejects.toThrow("internet connection");
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("does not mislabel an unexpected local result as live public verification", async () => {
    mocks.generateContent.mockResolvedValue({
      response: { inferenceSource: "on_device", text: () => "No search." },
    });
    await expect(
      verifyWithCloud(
        maskIdentifiers("Check this claim.").text,
        true,
        undefined,
        "public-sources",
      ),
    ).rejects.toThrow("did not run in the cloud");
  });
  it("routes mobile web text to rules even if a Prompt API-shaped object is exposed", async () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 16) Chrome/149.0.0.0 Mobile Safari/537.36",
    });
    expect(await checkWithLocalFallback("Police: pay now.")).toMatchObject({
      source: "LOCAL_RULES",
    });
    await expect(
      checkWithLocalFallback("", { data: "AA==", mimeType: "image/png" }),
    ).rejects.toThrow("This device cannot read screenshots privately yet");
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("rejects identifiable original text at the verification boundary", async () => {
    const raw = "Call 9876543210.";
    await expect(
      verifyWithCloud(
        raw as ReturnType<typeof maskIdentifiers>["text"],
        true,
        raw,
      ),
    ).rejects.toThrow(/privacy guard|redacted/i);
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("rejects missing consent before creating a model or making a request", async () => {
    await expect(
      verifyWithCloud(maskIdentifiers("hello").text, false),
    ).rejects.toThrow("permission");
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("redacts optional screenshot mismatch observations before displaying them", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText: "Pay now.",
            stages: ["Authority", "Fear", "Urgency", "Secrecy"].map((name) => ({
              name,
              found: name === "Urgency",
              evidence: "",
            })),
            imageMismatches: [
              "The sender shows 9876543210 beside a bank logo.",
              42,
            ],
          }),
      },
    });
    const result = await checkLocally("", {
      data: "AA==",
      mimeType: "image/png",
    });
    expect(result.imageMismatches).toEqual([
      "The sender shows [REDACTED] beside a bank logo.",
    ]);
    expect(result.text).toBe("Pay now.");
  });

  it("rejects malformed local output", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () => '{"redactedText":"hi","stages":[]}',
      },
    });
    await expect(checkLocally("hi")).rejects.toThrow("Incomplete");
  });
  it("sends only reviewed sanitized text with no forbidden sampling configuration", async () => {
    mocks.generateContent.mockResolvedValue({
      response: {
        text: () => "Uncertain",
        candidates: [],
        inferenceSource: "in_cloud",
      },
    });
    await verifyWithCloud(maskIdentifiers("Call 9876543210").text, true);
    expect(mocks.generateContent.mock.calls[0][0]).not.toContain("9876543210");
    expect(mocks.model.mock.calls[0][1].inCloudParams.generationConfig).toEqual(
      {
        maxOutputTokens: 1200,
      },
    );
  });
});
it.each(["none", "false", "not detected", "No evidence found"])(
  "does not count absent compact evidence %s as pressure",
  async (absent) => {
    mocks.generateContent.mockResolvedValue({
      response: {
        inferenceSource: "on_device",
        text: () =>
          JSON.stringify({
            redactedText: "Your parcel arrives tomorrow. No payment is needed.",
            stages: {
              Authority: absent,
              Fear: absent,
              Urgency: absent,
              Secrecy: absent,
            },
          }),
      },
    });
    const result = await checkLocally(
      "Your parcel arrives tomorrow. No payment is needed.",
    );
    expect(result.stages.filter((s) => s.found)).toHaveLength(0);
    expect(result.stages.every((s) => s.assessedByAI)).toBe(true);
  },
);
it("rejects invented or example-derived quotes without discarding other model findings", async () => {
  mocks.generateContent.mockResolvedValue({
    response: {
      inferenceSource: "on_device",
      text: () =>
        JSON.stringify({
          redactedText: "Please send the fee right now.",
          stages: {
            Authority: "I am a police officer",
            Fear: "you will be arrested",
            Urgency: "right now",
            Secrecy: "Do not tell your family",
          },
        }),
    },
  });
  const result = await checkLocally("Please send the fee right now.");
  expect(result.stages.filter((s) => s.found).map((s) => s.name)).toEqual([
    "Urgency",
  ]);
  expect(result.stages.find((s) => s.name === "Urgency")?.assessedByAI).toBe(
    true,
  );
  expect(result.stages.find((s) => s.name === "Fear")?.assessedByAI).toBe(
    false,
  );
  expect(result.ruleAssisted).toBe(true);
});
it("does not ground evidence solely in text invented by the local model", async () => {
  mocks.generateContent.mockResolvedValue({
    response: {
      inferenceSource: "on_device",
      text: () =>
        JSON.stringify({
          redactedText: "You will be arrested. Your parcel arrives tomorrow.",
          stages: {
            Authority: "",
            Fear: "You will be arrested",
            Urgency: "",
            Secrecy: "",
          },
        }),
    },
  });
  const result = await checkLocally("Your parcel arrives tomorrow.");
  expect(result.stages.some((s) => s.found)).toBe(false);
  expect(result.stages.find((s) => s.name === "Fear")?.assessedByAI).toBe(
    false,
  );
});
it("does not count a positive flag with empty evidence", async () => {
  mocks.generateContent.mockResolvedValue({
    response: {
      inferenceSource: "on_device",
      text: () =>
        JSON.stringify({
          redactedText: "Your parcel arrives tomorrow.",
          stages: ["Authority", "Fear", "Urgency", "Secrecy"].map((name) => ({
            name,
            found: true,
            evidence: "",
          })),
        }),
    },
  });
  const result = await checkLocally("Your parcel arrives tomorrow.");
  expect(result.stages.some((s) => s.found)).toBe(false);
  expect(result.ruleAssisted).toBe(true);
});

it.each(['hybrid','public-sources'] as const)('sends only typed placeholders in the exact %s SDK prompt',async purpose=>{
 const {TokenVaultSession}=await import('../src/lib/tokenVault');
 const vault=new TokenVaultSession();
 const raw='Name: Demo Ravi\nPay ₹35,000 to demo@upi and call +91 90000 00000 at https://sbi-test.example/private.';
 const approved=vault.tokenize(raw).text;
 mocks.generateContent.mockResolvedValue({response:{inferenceSource:'in_cloud',text:()=> 'Check [UPI_1] independently.'}});
 await verifyWithCloud(approved,true,raw,purpose);
 const exact=mocks.generateContent.mock.calls[0][0] as string;
 expect(exact).toContain(JSON.stringify(approved));
 for(const entry of vault.entries())expect(exact).not.toContain(entry.original);
 expect(exact).toContain('[PHONE_1]');expect(exact).not.toContain('90000');vault.clear();
});
