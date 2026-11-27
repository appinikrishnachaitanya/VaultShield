import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { AlignLeft, Volume2, Square } from "lucide-react";
import {
  optionalLocalSupport,
  summarizeForFamily,
  type FamilySummaryResult,
} from "../lib/firebase/ai";
import { usesAndroidModel } from "../services/androidNano";
import { familyLanguages, type FamilyLanguage } from "../lib/familyGuidance";
import { readWithLocalVoice, stopLocalReading } from "../lib/localVoice";
import { useLocalVoice, useLocalReading } from "../lib/useLocalVoice";
import type { SanitizedText } from "../types/privacy";
import { routeInput } from "../lib/router";

export default function MaaSummary({
  text,
  language,
  disabled = false,
  contentKind = "message",
  sourceLanguage = "en",
  cloudAllowed = true,
}: {
  text: SanitizedText;
  language: FamilyLanguage;
  disabled?: boolean;
  contentKind?: "message" | "assessment";
  sourceLanguage?: "en" | "hi";
  cloudAllowed?: boolean;
}) {
  const [summary, setSummary] = useState<FamilySummaryResult>();
  const canReadSummary = useLocalVoice(summary?.language ?? language);
  const reading = useLocalReading();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [audioNotice, setAudioNotice] = useState("");
  const [allowCloudFallback, setAllowCloudFallback] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const support = optionalLocalSupport();
  const hybrid =
    usesAndroidModel && cloudAllowed && routeInput(text).tier !== "LOCAL_ONLY";
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
      const value = await summarizeForFamily(
        text,
        language,
        (message) => {
          if (active.current) setProgress(message);
        },
        sourceLanguage,
        allowCloudFallback,
        !hybrid,
      );
      // if Hindi text is not returned, show English result � better UX than an error
      if (active.current) setSummary(value);
    } catch (error) {
      if (active.current)
        setError(
          !usesAndroidModel &&
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
      aria-label={`${t("Maa Mode")} ${t(contentKind)} ${t("summary")}`}
    >
      <h4>
        <AlignLeft size={19} aria-hidden="true" />
        {t(" Understand this ")}
        {t(contentKind)} · {familyLanguages[language]}
      </h4>
      <p>
        {hybrid
          ? t(
              "Firebase AI Logic prefers on-device summarization. If local AI is unavailable, it can use only the redacted text after your approval.",
            )
          : contentKind === "assessment"
            ? t(
                "A short, simple explanation in your language, created privately on this device when supported. No additional cloud request.",
              )
            : t(
                "Summarize the redacted message locally, then translate it into your Maa Mode language when supported.",
              )}
        {!usesAndroidModel &&
          contentKind === "message" &&
          t(
            " Local summarization uses English internally. Hindi source text is translated on-device when supported.",
          )}
      </p>
      {hybrid && (
        <div className="summary-cloud-approval">
          <details>
            <summary>{t("Review the redacted text for this summary")}</summary>
            <pre className="preserve-lines">{text}</pre>
          </details>
          <label className="consent">
            <input
              type="checkbox"
              checked={allowCloudFallback}
              disabled={disabled || busy}
              onChange={(event) => setAllowCloudFallback(event.target.checked)}
            />
            {t(
              "I approve Firebase using this redacted text in the cloud only if on-device summarization is unavailable.",
            )}
          </label>
        </div>
      )}
      <div className="tool-actions">
        <button
          type="button"
          className="secondary"
          disabled={
            disabled ||
            busy ||
            !support.summarizer ||
            (hybrid && !allowCloudFallback)
          }
          onClick={() => void summarize()}
        >
          {busy
            ? t("Preparing summary…")
            : hybrid
              ? t("Approve & explain simply")
              : t("Explain simply in my language")}
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
            {reading ? t("Stop reading") : t("Read summary aloud")}
          </button>
        )}
      </div>
      {!support.summarizer && (
        <p className="tool-hint">
          {contentKind === "assessment"
            ? t(
                "Local summarization is unavailable in this browser. The full assessment above is still available. No cloud translation was used.",
              )
            : t(
                "Local summarization is unavailable in this browser. The Maa Mode safety guidance above is still available.",
              )}
        </p>
      )}
      {busy && (
        <p role="status" className="local-progress">
          {t(progress)}
        </p>
      )}
      {error && (
        <p role="alert" className="tool-error">
          {t(error)}
        </p>
      )}
      {summary && (
        <div className="tool-output">
          <span
            className={`badge ${summary.source === "IN_CLOUD" ? "cloud" : "local"}`}
          >
            {summary.source === "IN_CLOUD"
              ? `${t("CLOUD FALLBACK · ")}${summary.model ?? "Firebase AI Logic"} · `
              : t("ON-DEVICE · ")}
            {(summary.durationMs / 1000).toFixed(2)}s ·{" "}
            {familyLanguages[summary.language]}
          </span>
          {summary.notice && (
            <p role="status" className="tool-hint">
              {t(summary.notice)}
            </p>
          )}
          <p lang={summary.language} className="preserve-lines">
            {summary.text}
          </p>
          <p className="tool-hint">
            {t(
              " AI can omit details or mistranslate. Compare deadlines, amounts and obligations with the source; this is not a legal assessment. ",
            )}
          </p>
        </div>
      )}
      {audioNotice && (
        <p role="status" className="tool-hint">
          {t(audioNotice)}
        </p>
      )}
      <details className="source-details">
        <summary>
          {t(" Compare with the")}{" "}
          {contentKind === "assessment"
            ? t("full assessment")
            : t("redacted message")}
        </summary>
        <p className="preserve-lines">{text}</p>
      </details>
    </section>
  );
}
