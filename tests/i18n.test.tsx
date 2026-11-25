import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../src/lib/firebase/ai", () => ({
  optionalLocalSupport: () => ({ summarizer: false }),
  summarizeForFamily: vi.fn(),
  draftLocalReply: vi.fn(),
  translateFamilyGuidance: vi.fn(),
}));
import { getLanguage, setLanguage, t, tacticCount } from "../src/lib/i18n";
import { FamilySafety } from "../src/components/FamilySafety";
import PressureEvidence from "../src/components/PressureEvidence";
import CloudAssessment from "../src/components/CloudAssessment";
import { maskIdentifiers } from "../src/lib/privacy";
const result = {
  text: maskIdentifiers("CBI officer: pay within 10 minutes.").text,
  stages: [
    {
      name: "Authority" as const,
      found: true,
      evidence: "CBI officer",
      action:
        "Call the organisation using its official website or the number on your bank card.",
    },
  ],
  masked: 0,
  durationMs: 100,
  source: "ON_DEVICE" as const,
};
afterEach(() => {
  setLanguage("en");
  vi.unstubAllGlobals();
});
describe("global English and Hindi preference", () => {
  it("switches UI copy and count without changing source text", () => {
    setLanguage("hi");
    expect(getLanguage()).toBe("hi");
    expect(t("Check privately")).toBe("निजी तौर पर जाँचें");
    expect(tacticCount(4)).toContain("4 में से 4");
    const html = renderToStaticMarkup(<PressureEvidence result={result} />);
    expect(html).toContain("रुकें और समझें");
    expect(html).toContain("CBI officer");
    expect(html).toContain("pay within 10 minutes.");
    expect(result.stages[0].name).toBe("Authority");
    setLanguage("en");
    expect(t("Check privately")).toBe("Check privately");
  });
  it("automatically selects Hindi for Maa Mode and its summary", () => {
    setLanguage("hi");
    const html = renderToStaticMarkup(
      <FamilySafety result={result} coolOffUntil={null} />,
    );
    expect(html).toContain('value="hi" lang="hi" selected=""');
    expect(html).toContain("रुकिए। पैसे मत भेजिए");
    expect(html).toContain("मेरी भाषा में आसान शब्दों में समझाएँ");
    expect(html).toContain("संदेश");
  });
  it("changes preference without making requests or storing user content", () => {
    const fetch = vi.fn(),
      setItem = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", { setItem });
    setLanguage("hi");
    expect(setItem).toHaveBeenCalledWith("vaultshield-language", "hi");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("works when browser preference storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => setLanguage("hi")).not.toThrow();
    expect(t("Your privacy")).toBe("आपकी गोपनीयता");
  });
  it("preserves an older report and offers local translation rather than silent cloud processing", () => {
    setLanguage("hi");
    const html = renderToStaticMarkup(
      <CloudAssessment
        cloud={{
          text: "Original English assessment.",
          language: "en",
          source: "IN_CLOUD",
          purpose: "public-sources",
          durationMs: 100,
          model: "test",
          metadata: undefined,
        }}
      />,
    );
    expect(html).toContain("Original English assessment.");
    expect(html).toContain("यह परिणाम इसी डिवाइस पर अनुवाद करें");
    expect(html).toContain('value="hi" selected=""');
  });
});
