import { useEffect, useRef, useState } from "react";
import { AlignLeft, Volume2, Square } from "lucide-react";
import {
  optionalLocalSupport,
  summarizeForFamily,
  type FamilySummaryResult,
} from "../lib/firebase/ai";
import { familyLanguages, type FamilyLanguage } from "../lib/familyGuidance";
import { readWithLocalVoice, stopLocalReading } from "../lib/localVoice";
import { useLocalVoice, useLocalReading } from "../lib/useLocalVoice";
import type { SanitizedText } from "../types/privacy";

export default function MaaSummary({
  text,
  language,
  disabled = false,
  contentKind = "message",
}: {
  text: SanitizedText;
  language: FamilyLanguage;
  disabled?: boolean;
  contentKind?: "message" | "assessment";
}) {
  const [summary, setSummary] = useState<FamilySummaryResult>();
  const canReadSummary = useLocalVoice(summary?.language ?? language);
  const reading = useLocalReading();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [audioNotice, setAudioNotice] = useState("");
  const active = useRef(true);
  const running = useRef(false);
  const support = optionalLocalSupport();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      stopLocalReading();
    };
  }, []);
  async function summarize() {
    if (running.current) return;
    running.current = true;
    stopLocalReading();
    setBusy(true);
    setError("");
    setAudioNotice("");
    try {
      const value = await summarizeForFamily(text, language, (message) => {
        if (active.current) setProgress(message);
      });
      if (active.current) setSummary(value);
    } catch (error) {
      if (active.current)
        setError(
          contentKind === "assessment" &&
            error instanceof Error &&
            /not support|unavailable/i.test(error.message)
            ? "A private summary is not available on this device. Your full assessment is still available above."
            : error instanceof Error
              ? error.message
              : "The local summary could not finish. The safety guidance above is still available.",
        );
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  return (
    <section
      className="maa-summary"
      aria-label={`Maa Mode ${contentKind} summary`}
    >
      <h4>
        <AlignLeft size={19} aria-hidden="true" /> Understand this {contentKind}{" "}
        · {familyLanguages[language]}
      </h4>
      <p>
        {contentKind === "assessment"
          ? "A short, simple explanation in your language, created privately on this device when supported. No additional cloud request."
          : "Summarize the redacted message locally, then translate it into your Maa Mode language when supported."}
        {contentKind === "message" &&
          " English source text is currently required by the summarizer."}
      </p>
      <div className="tool-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || !support.summarizer}
          onClick={() => void summarize()}
        >
          {busy ? "Preparing summary…" : "Summarize in my language"}
        </button>
        {summary && (canReadSummary || reading) && (
          <button
            type="button"
            className="secondary"
            disabled={!reading && (disabled || busy)}
            onClick={() =>
              reading
                ? stopLocalReading()
                : summary &&
                  readWithLocalVoice(
                    summary.text,
                    summary.language,
                    setAudioNotice,
                  )
            }
          >
            {reading ? (
              <Square size={17} aria-hidden="true" />
            ) : (
              <Volume2 size={17} aria-hidden="true" />
            )}
            {reading ? "Stop reading" : "Read summary aloud"}
          </button>
        )}
      </div>
      {!support.summarizer && (
        <p className="tool-hint">
          {contentKind === "assessment"
            ? "Local summarization is unavailable in this browser. The full assessment above is still available. No cloud translation was used."
            : "Local summarization is unavailable in this browser. The Maa Mode safety guidance above is still available."}
        </p>
      )}
      {busy && (
        <p role="status" className="local-progress">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="tool-error">
          {error}
        </p>
      )}
      {summary && (
        <div className="tool-output">
          <span className="badge local">
            ON-DEVICE · {(summary.durationMs / 1000).toFixed(2)}s ·{" "}
            {familyLanguages[summary.language]}
          </span>
          {summary.notice && (
            <p role="status" className="tool-hint">
              {summary.notice}
            </p>
          )}
          <p lang={summary.language} className="preserve-lines">
            {summary.text}
          </p>
          <p className="tool-hint">
            AI can omit details or mistranslate. Compare deadlines, amounts and
            obligations with the source; this is not a legal assessment.
          </p>
        </div>
      )}
      {audioNotice && (
        <p role="status" className="tool-hint">
          {audioNotice}
        </p>
      )}
      <details className="source-details">
        <summary>
          Compare with the{" "}
          {contentKind === "assessment"
            ? "full assessment"
            : "redacted message"}
        </summary>
        <p className="preserve-lines">{text}</p>
      </details>
    </section>
  );
}
