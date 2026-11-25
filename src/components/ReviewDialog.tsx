import type { Ref } from "react";
import {
  X,
  LockKeyhole,
  ShieldCheck,
  Globe2,
  CircleAlert,
  FileText,
} from "lucide-react";
import { t } from "../lib/i18n";
import type { PrivacyRoute } from "../lib/router";
import type { LeakResult } from "../lib/leakTest";
import { hasAssessableText } from "../lib/privacy";
import { privacyCategoryLabel } from "../lib/privacyLabels";
import LeakTestPanel from "./LeakTestPanel";
import CloudApproval from "./CloudApproval";
type Purpose = "hybrid" | "public-sources";
type Props = {
  dialogRef: Ref<HTMLElement>;
  text: string;
  onEdit: (text: string) => void;
  route: PrivacyRoute;
  leak: LeakResult;
  busy: boolean;
  error: string;
  purpose: Purpose;
  onPurpose: (purpose: Purpose) => void;
  sensitiveOverride: boolean;
  onOverride: (value: boolean) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
};
export default function ReviewDialog({
  dialogRef,
  text,
  onEdit,
  route,
  leak,
  busy,
  error,
  purpose,
  onPurpose,
  sensitiveOverride,
  onOverride,
  consent,
  onConsent,
  onSubmit,
  onClose,
}: Props) {
  const localOnly = route.tier === "LOCAL_ONLY";
  return (
    <div className="review-overlay">
      <section
        ref={dialogRef}
        className="review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <header className="review-header">
          <div>
            <span className="review-eyebrow">
              <LockKeyhole size={14} aria-hidden="true" />
              {t("You are in control")}
            </span>
            <h2 id="consent-title">{t("Review before you share")}</h2>
            <p>
              {t(
                "Only the text you approve can leave. Your original and screenshots stay on this device.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="review-close"
            aria-label={t("Close review")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="review-body">
          <section className="review-step" aria-labelledby="review-text-title">
            <div className="review-step-heading">
              <span className="review-step-number">1</span>
              <div>
                <h3 id="review-text-title">{t("Check the masked text")}</h3>
                <p>
                  {t(
                    "Remove any names, addresses or private details that were missed.",
                  )}
                </p>
              </div>
            </div>
            <div className="review-editor">
              <label htmlFor="redacted">
                <span>
                  <FileText size={16} aria-hidden="true" />
                  {t("Text approved for AI")}
                </span>
                <small>{t("You can edit this")}</small>
              </label>
              <textarea
                id="redacted"
                value={text}
                maxLength={16000}
                disabled={busy}
                onChange={(event) => onEdit(event.target.value)}
                aria-describedby="review-token-help"
              />
              <p id="review-token-help">
                {t("Words in square brackets replace private details.")}
              </p>
            </div>
            <LeakTestPanel result={leak} text={text} />
            {!hasAssessableText(text) && (
              <p className="review-inline-warning" role="status">
                {t(
                  "There is no readable message to check. Add the message wording before approving.",
                )}
              </p>
            )}
          </section>
          <section className="review-step">
            <div className="review-step-heading">
              <span className="review-step-number">2</span>
              <div>
                <h3>{t("Choose your check")}</h3>
                <p>{t("Both options use only the text above.")}</p>
              </div>
            </div>
            <fieldset className="review-options" disabled={busy}>
              <legend className="sr-only">
                {t("What would you like to check?")}
              </legend>
              <label
                className={`review-option ${purpose === "hybrid" ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="verification-purpose"
                  value="hybrid"
                  checked={purpose === "hybrid"}
                  onChange={() => onPurpose("hybrid")}
                />
                <span className="review-option-copy">
                  <strong>
                    <ShieldCheck size={19} aria-hidden="true" />
                    {t("Ask AI to check this")}
                  </strong>
                  <small>
                    {t(
                      "Tries your device first. Uses cloud only if needed. No web search.",
                    )}
                  </small>
                </span>
              </label>
              <label
                className={`review-option ${purpose === "public-sources" ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="verification-purpose"
                  value="public-sources"
                  checked={purpose === "public-sources"}
                  onChange={() => onPurpose("public-sources")}
                />
                <span className="review-option-copy">
                  <strong>
                    <Globe2 size={19} aria-hidden="true" />
                    {t("Check public sources")}
                  </strong>
                  <small>
                    {t(
                      "Uses cloud AI with Google Search. Findings may be inconclusive.",
                    )}
                  </small>
                </span>
              </label>
            </fieldset>
          </section>
          {localOnly && (
            <section
              className="review-sensitive"
              aria-label={t("Sensitive content")}
            >
              <div className="review-sensitive-heading">
                <CircleAlert size={20} aria-hidden="true" />
                <h3>{t("Sensitive details detected")}</h3>
              </div>
              <div className="review-sensitive-tags">
                {route.reasons.map((reason) => (
                  <span key={reason}>{t(privacyCategoryLabel(reason))}</span>
                ))}
              </div>
              <p>
                {t(
                  "Identifiers are masked, but the remaining content may still be private.",
                )}
              </p>
              {route.overrideAllowed ? (
                <label className="review-sensitive-consent">
                  <input
                    type="checkbox"
                    checked={sensitiveOverride}
                    disabled={busy}
                    onChange={(event) => onOverride(event.target.checked)}
                  />
                  <span>
                    <strong>
                      {t("Allow this reviewed text to use cloud AI")}
                    </strong>
                    <small>
                      {t(
                        "I understand sensitive details may remain after masking. This is optional.",
                      )}
                    </small>
                  </span>
                </label>
              ) : (
                <p>
                  {t(
                    "This image must be read on your device before text can be reviewed.",
                  )}
                </p>
              )}
            </section>
          )}
        </div>
        <footer className="review-footer">
          {error && (
            <p role="alert" className="review-error">
              {t(error)}
            </p>
          )}
          <CloudApproval
            route={route}
            blocked={leak.blocked}
            busy={busy}
            readable={hasAssessableText(text)}
            consent={consent}
            onConsent={onConsent}
            onSubmit={onSubmit}
            purpose={purpose}
            sensitiveOverride={sensitiveOverride}
            onCancel={onClose}
          />
        </footer>
      </section>
    </div>
  );
}
