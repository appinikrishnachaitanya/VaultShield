import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PressureEvidence from "../src/components/PressureEvidence";
import { pressureEvidenceParts } from "../src/lib/pressureEvidence";
import type { SanitizedText, Stage } from "../src/types/privacy";

const stage = (
  evidence: string,
  name: Stage["name"] = "Authority",
  found = true,
): Stage => ({ evidence, name, found, action: "Verify independently." });
describe("redacted pressure evidence", () => {
  it("keeps evidence offsets correct after Unicode case expansion", () => {
    const parts = pressureEvidenceParts("İ संदेश: CBI officer", [stage("CBI")]);
    expect(parts.filter((part) => part.stage).map((part) => part.text)).toEqual(
      ["CBI"],
    );
    expect(parts.map((part) => part.text).join("")).toBe("İ संदेश: CBI officer");
  });
  it("keeps the preview intact with overlapping, repeated and absent evidence", () => {
    const text = "CBI officer: CBI. Call [REDACTED].";
    const parts = pressureEvidenceParts(text, [
      stage("CBI"),
      stage("CBI officer", "Fear"),
      stage("not in the message", "Secrecy"),
      stage("Call [REDACTED]", "Urgency"),
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.stage).map((part) => part.text)).toEqual(
      ["CBI officer", "CBI"],
    );
    expect(
      parts.some((part) => part.stage && part.text.includes("[REDACTED]")),
    ).toBe(false);
  });
  it("does not highlight undetected tactics or blank evidence", () => {
    expect(
      pressureEvidenceParts("Normal delivery.", [
        stage("delivery", "Urgency", false),
        stage(" "),
      ]),
    ).toEqual([{ text: "Normal delivery." }]);
  });
  it("escapes hostile message markup and provides text labels alongside colors", () => {
    const text = '<img src=x onerror="alert(1)"> CBI';
    const html = renderToStaticMarkup(
      <PressureEvidence
        result={{
          text: text as SanitizedText,
          stages: [stage("CBI")],
          masked: 0,
          source: "LOCAL_RULES",
          durationMs: 1,
        }}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("Authority:");
    expect(html).toContain("saved number");
  });
});
