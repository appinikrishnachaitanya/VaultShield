import { setLanguage as setAppLanguage, t, useAppLanguage } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { HeartHandshake, ShieldCheck, BookOpen } from "lucide-react";
import {
  translateFamilyGuidance,
  type verifyWithCloud,
} from "../lib/firebase/ai";
import { maskIdentifiers } from "../lib/privacy";
import { familyLanguages, type FamilyLanguage } from "../lib/familyGuidance";
import MaaSummary from "./MaaSummary";
import AssessmentMarkdown from "./AssessmentMarkdown";
import { groundingSources } from "../lib/groundingSources";

type Assessment = Omit<
  Awaited<ReturnType<typeof verifyWithCloud>>,
  "language"
> & { language?: "en" | "hi" };
export default function CloudAssessment({ cloud, localDisplay = (text: string) => text }: { cloud: Assessment; localDisplay?: (text: string) => string }) {
  const report = useRef<HTMLElement>(null);
  useEffect(() => {
    report.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    report.current?.focus({ preventScroll: true });
  }, []);
  const appLanguage = useAppLanguage();
  const [language, setLanguage] = useState<FamilyLanguage>(appLanguage);
  useEffect(() => {
    setLanguage(appLanguage);
  }, [appLanguage]);
  const [translated, setTranslated] = useState<{
    text: string;
    language: "en" | "hi";
  }>();
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const reportLanguage = cloud.language ?? "en";
  const display =
    translated?.language === appLanguage
      ? translated
      : { text: cloud.text, language: reportLanguage };
  async function translateReport() {
    if (translating) return;
    setTranslating(true);
    setTranslationError("");
    const target = appLanguage;
    try {
      // Translate short sections separately: a whole assessment can exceed the
      // local translator's useful context and return an English paraphrase.
      const sections = cloud.text.split(/\n\s*\n/u).filter(Boolean);
      const translatedSections = await translateFamilyGuidance(
        sections,
        target,
        reportLanguage,
      );
      if (
        target === "hi" &&
        translatedSections.some((section) => !/[\u0900-\u097f]/u.test(section))
      ) {
        throw new Error("Hindi translation did not produce Hindi text.");
      }
      const text = translatedSections.join("\n\n");
      if (active.current) setTranslated({ text, language: target });
    } catch {
      if (active.current)
        setTranslationError(
          "Local translation is unavailable. The original result is preserved; no cloud request was made.",
        );
    } finally {
      if (active.current) setTranslating(false);
    }
  }
  const sources = groundingSources(cloud.metadata);
  const local = cloud.source === "ON_DEVICE";
  return (
    <section
      ref={report}
      tabIndex={-1}
      className="card cloud-result"
      aria-label={t("Verification result")}
    >
      <span className={`badge ${local ? "local" : "cloud"}`}>
        {local
          ? t("HYBRID · ON-DEVICE")
          : cloud.purpose === "public-sources"
            ? t("CLOUD · PUBLIC-SOURCE CHECK")
            : t("HYBRID · CLOUD FALLBACK")}
        {" · "}
        {(cloud.durationMs / 1000).toFixed(2)}s
      </span>
      <h2>{t("Your verification, explained clearly.")}</h2>
      <p className="tool-hint">
        {local
          ? t("Reviewed text analyzed on this device. No live web search.")
          : `${cloud.model} · ${t("Approved redacted text only.")}`}
      </p>
      <a className="assessment-maa-shortcut" href="#assessment-maa">
        {t("Hear a short explanation ↓")}
      </a>
      <div className="assessment-detail-heading">
        <BookOpen size={21} aria-hidden="true" />
        <h3>
          {local
            ? t("Your second opinion")
            : sources.length
              ? t("Search-assisted assessment")
              : t("Assessment · no sources returned")}
        </h3>
      </div>
      {display.language !== appLanguage && (
        <div className="language-result-note">
          <p>
            {t(
              "This result was written in a different language. Translate it locally, or approve a new verification in your selected language.",
            )}
          </p>
          <button
            className="secondary"
            disabled={translating}
            onClick={() => void translateReport()}
          >
            {t(
              translating
                ? "Translating on this device…"
                : "Translate this result on this device",
            )}
          </button>
        </div>
      )}
      {translationError && <p role="status">{t(translationError)}</p>}
      {display === translated && (
        <p className="tool-hint">
          {t("Locally translated · check wording against the original result.")}
        </p>
      )}
      <div lang={display.language}>
        <AssessmentMarkdown text={localDisplay(display.text)} />
      </div>
      <div className="assessment-pause">
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <h3>{t("Before you act, verify independently")}</h3>
          <p>
            {t(
              " For a payment or urgent request, pause and contact the person or organisation using a saved number, bank card or known official website. ",
            )}
          </p>
        </div>
      </div>
      <section
        className="assessment-maa"
        id="assessment-maa"
        aria-label={t("Maa Mode for this assessment")}
      >
        <div className="safety-heading">
          <h3>
            <HeartHandshake size={22} aria-hidden="true" />
            {t(" Maa Mode · Make this easier ")}
          </h3>
          <label htmlFor="assessment-language">
            {t(" Your language ")}
            <select
              id="assessment-language"
              value={language}
              onChange={(event) => {
                const next = event.target.value as FamilyLanguage;
                setLanguage(next);
                if (next === "en" || next === "hi") setAppLanguage(next);
              }}
            >
              {Object.entries(familyLanguages).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MaaSummary
          key={`${language}:${display.text}`}
          text={maskIdentifiers(display.text).text}
          sourceLanguage={display.language}
          language={language}
          contentKind="assessment"
        />
      </section>
      <p className="tool-hint assessment-caveat">
        {t(
          " AI guidance can be wrong. This assessment does not authenticate the sender or establish legal validity. ",
        )}
      </p>
      {!local && (
        <section
          className="assessment-sources"
          aria-label={t("Returned public sources")}
        >
          <h3>
            {sources.length
              ? t("Evidence returned by search")
              : t("No public sources were returned")}
          </h3>
          <p>
            {sources.length
              ? t(
                  "Search results are not a verification badge. Check the page, its publisher, relevance and date before relying on it.",
                )
              : t(
                  "Treat this as an AI explanation, not a confirmed public-source finding.",
                )}
          </p>
          {sources.length > 0 &&
            sources.every((source) => source.community) && (
              <p className="source-quality-notice" role="status">
                {t(
                  " Only code or community-hosted results were identified. These do not establish an official fraud warning. Official-source verification remains inconclusive. ",
                )}
              </p>
            )}
          {sources.length > 0 && (
            <ul>
              {sources.map((source, index) => (
                <li key={`${source.uri}:${index}`}>
                  <a
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title || t("Open public source")}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                  <p className="tool-hint">
                    {source.community
                      ? t(
                          "Code/community host · not authoritative evidence for financial or police claims.",
                        )
                      : t(
                          "Returned by search · relevance not independently checked.",
                        )}
                    {source.redirected &&
                      t(
                        " Publisher label supplied by Search; destination not independently checked.",
                      )}
                  </p>
                  {source.excerpts.length > 0 ? (
                    <details className="source-details">
                      <summary>
                        {t(" Which part of the answer used this source? ")}
                      </summary>
                      {source.excerpts.map((excerpt, i) => (
                        <p key={i}>{excerpt}</p>
                      ))}
                    </details>
                  ) : (
                    <p className="tool-hint">
                      {t(" No claim-to-source excerpt was supplied. ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {cloud.metadata?.searchEntryPoint?.renderedContent && (
        <iframe
          title={t("Google Search suggestions")}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={cloud.metadata.searchEntryPoint.renderedContent}
          className="search-suggestions"
        />
      )}
    </section>
  );
}
