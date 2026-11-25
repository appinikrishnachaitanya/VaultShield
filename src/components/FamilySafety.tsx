import { setLanguage as setAppLanguage, t, useAppLanguage } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Clock3, HeartHandshake, Phone, Volume2, Square } from "lucide-react";
import {
  familyGuidance,
  familyLanguages,
  type FamilyLanguage,
} from "../lib/familyGuidance";
import {
  draftLocalReply,
  optionalLocalSupport,
  translateFamilyGuidance,
} from "../lib/firebase/ai";
import type { LocalResult } from "../types/privacy";
import MaaSummary from "./MaaSummary";
import { readWithLocalVoice, stopLocalReading } from "../lib/localVoice";
import { useLocalVoice, useLocalReading } from "../lib/useLocalVoice";

export function FamilySafety({
  result,
  coolOffUntil,
  cloudAllowed = true,
}: {
  result: LocalResult;
  coolOffUntil: number | null;
  cloudAllowed?: boolean;
}) {
  const appLanguage = useAppLanguage();
  const [language, setLanguage] = useState<FamilyLanguage>(appLanguage);
  const latestLanguage = useRef<FamilyLanguage>(appLanguage);
  useEffect(() => {
    latestLanguage.current = appLanguage;
    setLanguage(appLanguage);
    setTranslation(undefined);
    setReplyDraft(undefined);
  }, [appLanguage]);
  const canReadAloud = useLocalVoice(language);
  const reading = useLocalReading();
  const [audioNotice, setAudioNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const content = familyGuidance(language, result.stages);
  const [translation, setTranslation] = useState<string[]>();
  const [replyDraft, setReplyDraft] = useState<string>();
  const [localTask, setLocalTask] = useState<"translation" | "reply" | null>(
    null,
  );
  const [toolNotice, setToolNotice] = useState("");
  const support = optionalLocalSupport();
  const lines = translation ?? content.lines;

  async function runLocalTool(kind: "translation" | "reply") {
    setLocalTask(kind);
    setToolNotice("");
    try {
      if (kind === "translation" && language !== "en") {
        const value = await translateFamilyGuidance(
          familyGuidance("en", result.stages).lines,
          language,
        );
        if (latestLanguage.current === language) setTranslation(value);
      } else if (kind === "reply") {
        const value = await draftLocalReply(
          result.stages
            .filter((stage) => stage.found)
            .map((stage) => stage.name),
          language,
        );
        if (latestLanguage.current === language) setReplyDraft(value);
      }
    } catch (error) {
      if (latestLanguage.current === language)
        setToolNotice(
          error instanceof Error
            ? error.message
            : "The built-in guidance is still available.",
        );
    } finally {
      setLocalTask(null);
    }
  }

  useEffect(() => {
    if (!coolOffUntil) return;
    const refresh = () => {
      const time = Date.now();
      setNow(time);
      if (time >= coolOffUntil) window.clearInterval(timer);
    };
    const timer = window.setInterval(refresh, 1000);
    refresh();
    return () => window.clearInterval(timer);
  }, [coolOffUntil]);

  useEffect(() => () => stopLocalReading(), []);

  function speak() {
    readWithLocalVoice(lines.join(" "), language, setAudioNotice);
  }

  const seconds = coolOffUntil
    ? Math.max(0, Math.ceil((coolOffUntil - now) / 1000))
    : 0;
  return (
    <section className="card family-safety">
      {coolOffUntil && (
        <div className="cool-off">
          <span className="breathing-dot">
            <Clock3 size={22} aria-hidden="true" />
          </span>
          <div>
            <h3>{t("10-minute Cool-Off Shield")}</h3>
            <p>
              {seconds
                ? t(
                    "Pause before paying. Breathe slowly and call someone you trust.",
                  )
                : t("Pause complete. Verify the request before paying.")}
            </p>
          </div>
          {seconds > 0 && (
            <time role="timer" aria-label={t("Time remaining")}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </time>
          )}
        </div>
      )}
      <div className="safety-heading">
        <h3>
          <HeartHandshake size={20} aria-hidden="true" />
          {t(" Maa Mode ")}
        </h3>
        <label>
          {t(" Language ")}
          <select
            value={language}
            disabled={!!localTask}
            onChange={(event) => {
              stopLocalReading();
              latestLanguage.current = event.target.value as FamilyLanguage;
              setLanguage(event.target.value as FamilyLanguage);
              if (event.target.value === "en" || event.target.value === "hi")
                setAppLanguage(event.target.value as "en" | "hi");
              setAudioNotice("");
              setTranslation(undefined);
              setReplyDraft(undefined);
              setToolNotice("");
            }}
          >
            {Object.entries(familyLanguages).map(([code, name]) => (
              <option key={code} value={code} lang={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul lang={language}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div
        className="safety-actions"
        role="group"
        aria-label={t("Voice and translation")}
      >
        {(canReadAloud || reading) && (
          <button
            type="button"
            className="secondary"
            onClick={reading ? stopLocalReading : speak}
          >
            {reading ? (
              <Square size={17} aria-hidden="true" />
            ) : (
              <Volume2 size={17} aria-hidden="true" />
            )}
            {reading ? t("Stop reading") : t("Read aloud")}
          </button>
        )}
        {support.translator && language !== "en" && (
          <button
            type="button"
            className="secondary"
            disabled={!!localTask}
            onClick={() => {
              if (translation) setTranslation(undefined);
              else void runLocalTool("translation");
            }}
          >
            {translation
              ? t("Use built-in guidance")
              : localTask === "translation"
                ? t("Preparing translation…")
                : t("Translate with local AI")}
          </button>
        )}
      </div>
      {translation && (
        <p>
          {t(
            " This version was translated on-device. You can switch back to built-in guidance. ",
          )}
        </p>
      )}
      {toolNotice && <p role="status">{t(toolNotice)}</p>}
      {audioNotice && <p role="status">{t(audioNotice)}</p>}
      <MaaSummary
        cloudAllowed={cloudAllowed}
        key={`${language}:${result.text}`}
        sourceLanguage={/[\u0900-\u097F]/u.test(result.text) ? "hi" : "en"}
        text={result.text}
        language={language}
        disabled={!!localTask}
      />
      <details className="safety-scripts">
        <summary>{t("Safe reply and verification call script")}</summary>
        <p>
          {t(
            " You do not need to reply to the sender. Verify independently using a contact you already trust. If you choose to reply, review this draft first. ",
          )}
        </p>
        <h4>{t("Reply draft")}</h4>
        <p lang={language}>{replyDraft ?? content.reply}</p>
        {support.writer && language === "en" && (
          <button
            type="button"
            className="secondary"
            disabled={!!localTask}
            onClick={() => void runLocalTool("reply")}
          >
            {localTask === "reply" ? "Drafting…" : t("Draft with local AI")}
          </button>
        )}
        {replyDraft && <p>{t("Review this draft before replying.")}</p>}
        <h4>{t("What to ask on the call")}</h4>
        <p lang={language}>{content.call}</p>
      </details>
    </section>
  );
}

export function AlreadyPaid({ result }: { result?: LocalResult }) {
  const [draft, setDraft] = useState<string>();
  return (
    <details className="card already-paid">
      <summary>
        <Phone size={18} aria-hidden="true" />
        {t(" I already paid ")}
      </summary>
      <ol>
        <li>
          {t(" In India, ")}
          <a href="tel:1930">{t("call 1930")}</a>
          {t(" to report financial cyber fraud. ")}
        </li>
        <li>
          {t(
            " Call your bank through the number on your card or its official app. Ask how to secure your account and report the payment. ",
          )}
        </li>
        <li>
          {t(
            " Keep the chat, screenshots, and transaction receipt. Report the incident at",
          )}{" "}
          <a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">
            cybercrime.gov.in
          </a>
          .
        </li>
      </ol>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          setDraft(
            [
              t("Subject: Suspected fraudulent payment"),
              "",
              t(
                "I am reporting a payment made after a suspicious request. Please review the transaction and tell me what steps I should take.",
              ),
              "",
              t("Date and time: [fill in]"),
              t(
                "Transaction reference: [fill in for your bank or official complaint]",
              ),
              ...(result
                ? ["", t("Context from my redacted report:"), result.text]
                : []),
            ].join("\n"),
          )
        }
      >
        {t(" Prepare complaint draft ")}
      </button>
      {draft !== undefined && (
        <label className="complaint-draft">
          {t(" Review your draft before sharing ")}
          <textarea
            rows={7}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
      )}
    </details>
  );
}
