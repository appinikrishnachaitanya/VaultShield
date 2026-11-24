import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../src/lib/firebase/ai", () => ({
  optionalLocalSupport: () => ({ summarizer: false }),
  summarizeForFamily: vi.fn(),
}));
import AssessmentMarkdown from "../src/components/AssessmentMarkdown";
import CloudAssessment from "../src/components/CloudAssessment";

const assessment = {
  text: "## What this means\n\nThis uses **urgency**.\n\n## What to do now\n\n1. Pause payment.\n2. Call a saved number.",
  source: "IN_CLOUD" as const,
  purpose: "public-sources" as const,
  model: "gemini-3.5-flash-lite",
  durationMs: 5150,
  metadata: undefined,
};
describe("verification presentation", () => {
  it("renders real paragraphs, emphasis and ordered steps instead of raw Markdown", () => {
    const html = renderToStaticMarkup(
      <AssessmentMarkdown text={assessment.text} />,
    );
    expect(html).toContain("<h3>What this means</h3>");
    expect(html).toContain("<strong>urgency</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Pause payment.</li>");
    expect(html).not.toContain("**urgency**");
  });
  it("does not execute model HTML or load remote images or unsafe links", () => {
    const html = renderToStaticMarkup(
      <AssessmentMarkdown
        text={
          '<script>alert(1)</script>\n\n<img src="https://tracker.invalid/image" onerror="alert(1)">\n\n[bad](javascript:alert) ![tracking](https://tracker.invalid/pixel)'
        }
      />,
    );
    expect(html).not.toMatch(
      /<script|<img|javascript:|onerror=|tracker\.invalid/,
    );
  });
  it("opens public links safely and unwraps a whole Markdown fence", () => {
    const html = renderToStaticMarkup(
      <AssessmentMarkdown
        text={
          "```markdown\n## Evidence\n\n[Official source](https://example.org/advice)\n```"
        }
      />,
    );
    expect(html).toContain("<h3>Evidence</h3>");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<pre>");
  });
  it("provides Maa Mode for the assessment and does not fake sources or unsupported local tools", () => {
    const html = renderToStaticMarkup(<CloudAssessment cloud={assessment} />);
    expect(html).toContain("Maa Mode for this assessment");
    expect(html).toContain("Understand this assessment");
    expect(html).toContain("No public sources were returned");
    expect(html).toContain("Local summarization is unavailable");
    expect(html).toContain("5.15");
    expect(html).not.toContain("Search-assisted assessment");
  });
  it("separates returned grounding sources and ignores invalid source URLs", () => {
    const html = renderToStaticMarkup(
      <CloudAssessment
        cloud={{
          ...assessment,
          metadata: {
            groundingChunks: [
              {
                web: {
                  uri: "https://example.org/official",
                  title: "Official advice",
                },
              },
              { web: { uri: "javascript:alert(1)", title: "Unsafe" } },
            ],
          },
        }}
      />,
    );
    expect(html).toContain("Search-assisted assessment");
    expect(html).toContain("Official advice");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">Unsafe<");
  });
  it("does not promote a GitHub result to authoritative verification", () => {
    const html = renderToStaticMarkup(
      <CloudAssessment
        cloud={{
          ...assessment,
          metadata: {
            groundingChunks: [
              {
                web: {
                  uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example",
                  title: "github.com",
                },
              },
            ],
          },
        }}
      />,
    );
    expect(html).toContain("Official-source verification remains inconclusive");
    expect(html).toContain("Code/community host");
    expect(html).toContain("Publisher label supplied by Search");
    expect(html).not.toContain("Compare with English summary");
  });
});
