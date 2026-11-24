import { t, useAppLanguage } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import {
  optionalLocalSupport,
  prepareLocalSpeech,
  startLocalDictation,
} from "../lib/firebase/ai";
export default function LocalDictation({
  disabled,
  onUse,
}: {
  disabled: boolean;
  onUse: (text: string) => void;
}) {
  const appLanguage = useAppLanguage();
  const supported = optionalLocalSupport().speech;
  const [language, setLanguage] = useState(`${appLanguage}-IN`);
  const [prepared, setPrepared] = useState("");
  const [transcript, setTranscript] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [listening, setListening] = useState(false);
  const recorder = useRef<Awaited<
    ReturnType<typeof startLocalDictation>
  > | null>(null);
  const operation = useRef(0);
  const mounted = useRef(true);
  const transcriptRef = useRef("");
  useEffect(() => {
    operation.current++;
    recorder.current?.abort();
    recorder.current = null;
    setListening(false);
    setLanguage(`${appLanguage}-IN`);
    setPrepared("");
  }, [appLanguage]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
      recorder.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (disabled) {
      operation.current++;
      recorder.current?.abort();
      recorder.current = null;
      setListening(false);
    }
  }, [disabled]);
  async function prepare() {
    const ticket = ++operation.current;
    setPreparing(true);
    setError("");
    setState(
      "Preparing a local speech pack. This may download language files.",
    );
    try {
      const lang = await prepareLocalSpeech(language);
      if (mounted.current && ticket === operation.current) {
        setPrepared(lang);
        setState(
          "Language pack ready. Tap Start local dictation when you want to use the microphone.",
        );
      }
    } catch (error) {
      if (mounted.current && ticket === operation.current)
        setError(
          error instanceof Error ? error.message : "Speech setup failed.",
        );
    } finally {
      if (mounted.current) setPreparing(false);
    }
  }
  async function start() {
    const ticket = ++operation.current;
    setError("");
    setListening(true);
    setState("Starting local microphone recognition…");
    try {
      const handle = await startLocalDictation(
        language,
        (chunk) => {
          if (!mounted.current || ticket !== operation.current) return;
          const next = [transcriptRef.current, chunk].filter(Boolean).join(" ");
          if (next.length > 16000) {
            recorder.current?.stop();
            setError(
              "Transcript reached the 16,000 character limit. Review it before continuing.",
            );
            return;
          }
          transcriptRef.current = next;
          setTranscript(next);
        },
        (message) => {
          if (mounted.current && ticket === operation.current) {
            setState(message);
            if (message.startsWith("Stopped")) setListening(false);
          }
        },
        (message) => {
          if (mounted.current && ticket === operation.current)
            setError(message);
        },
      );
      if (!mounted.current || ticket !== operation.current) handle.abort();
      else recorder.current = handle;
    } catch (error) {
      if (mounted.current && ticket === operation.current) {
        setListening(false);
        setError(
          error instanceof Error
            ? error.message
            : "Local dictation could not start.",
        );
      }
    }
  }
  return (
    <details
      className="dictation"
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          operation.current++;
          recorder.current?.abort();
          recorder.current = null;
          setListening(false);
        }
      }}
    >
      <summary>
        <Mic size={17} />
        {t(" Prefer speaking? Try local dictation ")}
        <span>{t("Optional")}</span>
      </summary>
      <div className="dictation-content">
        <p>
          {t(
            " Dictate what happened, or read the message aloud. Audio stays local. Review the transcript before adding it to your check. ",
          )}
        </p>
        {!supported ? (
          <p className="tool-hint">
            {t(
              " Strictly local speech recognition is unavailable in this browser. Type or paste your message instead. ",
            )}
          </p>
        ) : (
          <>
            <label htmlFor="speech-language">{t("Dictation language")}</label>
            <select
              id="speech-language"
              value={language}
              disabled={disabled || preparing || listening}
              onChange={(event) => {
                setLanguage(event.target.value);
                setPrepared("");
                setState("");
                setError("");
              }}
            >
              <option value="en-IN">{t("English · India")}</option>
              <option value="hi-IN">{t("Hindi · India (if supported)")}</option>
              <option value="en-US">{t("English · US")}</option>
            </select>
            <div className="tool-actions">
              <button
                className="secondary"
                disabled={disabled || preparing || listening}
                onClick={() => void prepare()}
              >
                {preparing
                  ? t("Preparing speech pack…")
                  : prepared === language
                    ? t("Check speech pack")
                    : t("Prepare local speech pack")}
              </button>
              {listening ? (
                <button
                  className="secondary stop-recording"
                  onClick={() => {
                    recorder.current?.stop();
                  }}
                >
                  <Square size={16} />
                  {t(" Stop dictation ")}
                </button>
              ) : (
                <button
                  className="secondary"
                  disabled={disabled || preparing || prepared !== language}
                  onClick={() => void start()}
                >
                  <Mic size={16} />
                  {t(" Start local dictation ")}
                </button>
              )}
            </div>
            <label htmlFor="speech-transcript">
              {t("Review your transcript")}
            </label>
            <textarea
              id="speech-transcript"
              value={transcript}
              maxLength={16000}
              disabled={listening || disabled}
              onChange={(event) => {
                transcriptRef.current = event.target.value;
                setTranscript(event.target.value);
              }}
              placeholder={t(
                "Your words will appear here. Check names, amounts and numbers carefully.",
              )}
            />
            <button
              className="secondary"
              disabled={disabled || listening || !transcript.trim()}
              onClick={() => {
                onUse(transcript);
                setState(
                  "Transcript added to the message field. Review it, then tap Check privately.",
                );
              }}
            >
              {t(" Add transcript to message ")}
            </button>
            <p className="tool-hint">
              {t(
                " Microphone permission is requested only when you start dictation. Recording stops when you leave this tab or after 60 seconds. Language availability is checked on your device. ",
              )}
            </p>
          </>
        )}
        {state && (
          <p role="status" className="local-progress">
            {t(state)}
          </p>
        )}
        {error && (
          <p role="alert" className="tool-error">
            {t(error)}
          </p>
        )}
      </div>
    </details>
  );
}
