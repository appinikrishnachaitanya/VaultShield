import { Cloud } from "lucide-react";
import { t } from "../lib/i18n";
import { cloudRouteBlocked, type PrivacyRoute } from "../lib/router";
export default function CloudApproval({
  route,
  blocked,
  busy,
  readable,
  consent,
  onConsent,
  onSubmit,
  purpose,
  sensitiveOverride = false,
  onCancel,
}: {
  route: PrivacyRoute;
  blocked: boolean;
  busy: boolean;
  readable: boolean;
  consent: boolean;
  onConsent: (value: boolean) => void;
  onSubmit: () => void;
  purpose: "hybrid" | "public-sources";
  sensitiveOverride?: boolean;
  onCancel?: () => void;
}) {
  const disabled =
    cloudRouteBlocked(route, sensitiveOverride) || blocked || busy || !readable;
  return (
    <>
      <label className="review-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(event) => onConsent(event.target.checked)}
        />
        {t(
          purpose === "public-sources"
            ? "I reviewed this text and approve sending it to Google’s cloud AI for public-source checking with Google Search."
            : "I reviewed this text and approve Firebase AI Logic to prefer on-device AI and send only this text to cloud if local inference is unavailable.",
        )}
      </label>
      <div className="review-footer-actions">
        {onCancel && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {t("Keep current result")}
          </button>
        )}
        <button
          className="primary review-submit"
          disabled={disabled || !consent}
          onClick={onSubmit}
        >
          <Cloud size={18} />
          {t(busy ? "Verifying…" : "Approve & verify")}
        </button>
      </div>
    </>
  );
}
