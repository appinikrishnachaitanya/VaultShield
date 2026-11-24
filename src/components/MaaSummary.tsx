import { useEffect, useRef, useState } from "react";
import { AlignLeft, Volume2 } from "lucide-react";
import {
  optionalLocalSupport,
  summarizeForFamily,
  type FamilySummaryResult,
} from "../lib/firebase/ai";
import { familyLanguages, type FamilyLanguage } from "../lib/familyGuidance";
import { readWithLocalVoice } from "../lib/localVoice";
import { useLocalVoice } from "../lib/useLocalVoice";
import type { SanitizedText } from "../types/privacy";

export default function MaaSummary({
  text,
  language,
  disabled = false,
}: {
  text: SanitizedText;
  language: FamilyLanguage;
  disabled?: boolean;
}) {
  const [summary, setSummary] = useState<FamilySummaryResult>();
  const canReadSummary = useLocalVoice(summary?.language ?? language);
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
      window.speechSynthesis?.cancel();
    };
  }, []);
  async function summarize() {
    if (running.current) return;
    running.current = true;
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
          error instanceof Error
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
    <section className="maa-summary" aria-label="Maa Mode message summary">
      <h4>
        <AlignLeft size={19} aria-hidden="true" /> Understand this message ·{" "}
        {familyLanguages[language]}
      </h4>
      <p>
        Summarize the redacted message locally, then translate it into your Maa
        Mode language when supported. English source text is currently required
        by the summarizer.
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
        {summary && canReadSummary && (
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy}
            onClick={() =>
              readWithLocalVoice(summary.text, summary.language, setAudioNotice)
            }
          >
            <Volume2 size={17} aria-hidden="true" />
            Read summary aloud
          </button>
        )}
      </div>
      {!support.summarizer && (
        <p className="tool-hint">
          Local summarization is unavailable in this browser. The Maa Mode
          safety guidance above is still available.
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
          {summary.language !== "en" && (
            <details className="source-details">
              <summary>Compare with English summary</summary>
              <p lang="en" className="preserve-lines">
                {summary.englishText}
              </p>
            </details>
          )}
        </div>
      )}
      {audioNotice && (
        <p role="status" className="tool-hint">
          {audioNotice}
        </p>
      )}
      <details className="source-details">
        <summary>Compare with the redacted message</summary>
        <p className="preserve-lines">{text}</p>
      </details>
    </section>
  );
}
