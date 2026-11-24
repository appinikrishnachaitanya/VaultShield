import { useEffect, useRef, useState } from "react";
import { HeartHandshake, ShieldCheck, BookOpen } from "lucide-react";
import type { verifyWithCloud } from "../lib/firebase/ai";
import { maskIdentifiers } from "../lib/privacy";
import { familyLanguages, type FamilyLanguage } from "../lib/familyGuidance";
import MaaSummary from "./MaaSummary";
import AssessmentMarkdown from "./AssessmentMarkdown";
import { groundingSources } from "../lib/groundingSources";

type Assessment = Awaited<ReturnType<typeof verifyWithCloud>>;
export default function CloudAssessment({ cloud }: { cloud: Assessment }) {
  const report = useRef<HTMLElement>(null);
  useEffect(() => {
    report.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    report.current?.focus({ preventScroll: true });
  }, []);
  const [language, setLanguage] = useState<FamilyLanguage>("hi");
  const sources = groundingSources(cloud.metadata);
  const local = cloud.source === "ON_DEVICE";
  return (
    <section
      ref={report}
      tabIndex={-1}
      className="card cloud-result"
      aria-label="Verification result"
    >
      <span className={`badge ${local ? "local" : "cloud"}`}>
        {local
          ? "HYBRID · ON-DEVICE"
          : cloud.purpose === "public-sources"
            ? "CLOUD · PUBLIC-SOURCE CHECK"
            : "HYBRID · CLOUD FALLBACK"}
        {" · "}
        {(cloud.durationMs / 1000).toFixed(2)}s
      </span>
      <h2>Your verification, explained clearly.</h2>
      <p className="tool-hint">
        {local
          ? "Reviewed text analyzed on this device. No live web search."
          : `${cloud.model} · Approved redacted text only.`}
      </p>
      <a className="assessment-maa-shortcut" href="#assessment-maa">
        Make this simpler in my language ↓
      </a>
      <div className="assessment-detail-heading">
        <BookOpen size={21} aria-hidden="true" />
        <h3>
          {local
            ? "Your local second opinion"
            : sources.length
              ? "Search-assisted assessment"
              : "Assessment · no sources returned"}
        </h3>
      </div>
      <AssessmentMarkdown text={cloud.text} />
      <div className="assessment-pause">
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <h3>Before you act, verify independently</h3>
          <p>
            For a payment or urgent request, pause and contact the person or
            organisation using a saved number, bank card or known official
            website.
          </p>
        </div>
      </div>
      <section
        className="assessment-maa"
        id="assessment-maa"
        aria-label="Maa Mode for this assessment"
      >
        <div className="safety-heading">
          <h3>
            <HeartHandshake size={22} aria-hidden="true" /> Maa Mode · Make this
            easier
          </h3>
          <label htmlFor="assessment-language">
            Your language
            <select
              id="assessment-language"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as FamilyLanguage)
              }
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
          key={`${language}:${cloud.text}`}
          text={maskIdentifiers(cloud.text).text}
          language={language}
          contentKind="assessment"
        />
      </section>
      <p className="tool-hint assessment-caveat">
        AI guidance can be wrong. This assessment does not authenticate the
        sender or establish legal validity.
      </p>
      {!local && (
        <section
          className="assessment-sources"
          aria-label="Returned public sources"
        >
          <h3>
            {sources.length
              ? "Evidence returned by search"
              : "No public sources were returned"}
          </h3>
          <p>
            {sources.length
              ? "Search results are not a verification badge. Check the page, its publisher, relevance and date before relying on it."
              : "Treat this as an AI explanation, not a confirmed public-source finding."}
          </p>
          {sources.length > 0 &&
            sources.every((source) => source.community) && (
              <p className="source-quality-notice" role="status">
                Only code or community-hosted results were identified. These do
                not establish an official fraud warning. Official-source
                verification remains inconclusive.
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
                    {source.title || "Open public source"}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                  <p className="tool-hint">
                    {source.community
                      ? "Code/community host · not authoritative evidence for financial or police claims."
                      : "Returned by search · relevance not independently checked."}
                    {source.redirected &&
                      " Publisher label supplied by Search; destination not independently checked."}
                  </p>
                  {source.excerpts.length > 0 ? (
                    <details className="source-details">
                      <summary>
                        Which part of the answer used this source?
                      </summary>
                      {source.excerpts.map((excerpt, i) => (
                        <p key={i}>{excerpt}</p>
                      ))}
                    </details>
                  ) : (
                    <p className="tool-hint">
                      No claim-to-source excerpt was supplied.
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
          title="Google Search suggestions"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={cloud.metadata.searchEntryPoint.renderedContent}
          className="search-suggestions"
        />
      )}
    </section>
  );
}
