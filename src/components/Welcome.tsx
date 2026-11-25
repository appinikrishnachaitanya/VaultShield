import { useCallback, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Cloud,
  Users,
  ArrowRight,
  X,
} from "lucide-react";
import { t, setLanguage, useAppLanguage } from "../lib/i18n";
import { useDialogFocus } from "../lib/useDialogFocus";
export default function Welcome() {
  const [open, setOpen] = useState(() => {
    try {
      return (
        !localStorage.getItem("vaultshield-welcome-v1") &&
        new URLSearchParams(location.search).get("view") !== "family"
      );
    } catch {
      return true;
    }
  });
  const language = useAppLanguage();
  const finish = useCallback(() => {
    try {
      localStorage.setItem("vaultshield-welcome-v1", "seen");
    } catch {
      /* This visit still works. */
    }
    setOpen(false);
  }, []);
  const ref = useDialogFocus(open, finish);
  if (!open) return null;
  return (
    <div className="welcome-backdrop">
      <section
        ref={ref}
        className="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-top">
          <span className="welcome-brand">
            <ShieldCheck size={24} /> VaultShield
          </span>
          <button
            className="welcome-close"
            onClick={finish}
            aria-label={t("Close")}
          >
            <X size={22} />
          </button>
        </div>
        <div className="welcome-languages" aria-label={t("Language")}>
          <button
            lang="en"
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            English
          </button>
          <button
            lang="hi"
            aria-pressed={language === "hi"}
            onClick={() => setLanguage("hi")}
          >
            हिन्दी
          </button>
        </div>
        <p className="welcome-eyebrow">
          {t("A little pause. A safer next step.")}
        </p>
        <h1 id="welcome-title">{t("Before you pay, pause here.")}</h1>
        <p className="welcome-intro">
          {t(
            "A worrying message? Check the pressure, protect your details, and find a calm next step.",
          )}
        </p>
        <ol className="welcome-steps">
          <li>
            <LockKeyhole size={23} />
            <div>
              <h2>{t("Start privately")}</h2>
              <p>
                {t(
                  "Paste a message or add a screenshot. The first check stays on your device.",
                )}
              </p>
            </div>
          </li>
          <li>
            <Cloud size={23} />
            <div>
              <h2>{t("You choose what leaves")}</h2>
              <p>
                {t(
                  "Review masked text before approving an AI follow-up or a check of public sources.",
                )}
              </p>
            </div>
          </li>
          <li>
            <Users size={23} />
            <div>
              <h2>{t("Bring someone you trust")}</h2>
              <p>
                {t(
                  "Ask your family for help without sending them the suspicious message.",
                )}
              </p>
            </div>
          </li>
        </ol>
        <button className="primary welcome-start" onClick={finish}>
          {t("Start a private check")}
          <ArrowRight size={20} />
        </button>
        <button
          className="welcome-account"
          onClick={() => {
            finish();
            window.dispatchEvent(new Event("vaultshield-open-account"));
          }}
        >
          {t("Keep my family circle with Google")}
        </button>
        <p className="welcome-footnote">
          {t("You can start without an account. Google sign-in is optional.")}
        </p>
      </section>
    </div>
  );
}
