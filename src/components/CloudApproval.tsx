import { Cloud } from "lucide-react";
import { t } from "../lib/i18n";
import type { PrivacyRoute } from "../lib/router";
export default function CloudApproval({
  route,
  blocked,
  busy,
  readable,
  consent,
  onConsent,
  onSubmit,
  purpose,
}: {
  route: PrivacyRoute;
  blocked: boolean;
  busy: boolean;
  readable: boolean;
  consent: boolean;
  onConsent: (value: boolean) => void;
  onSubmit: () => void;
  purpose: "hybrid" | "public-sources";
}) {
  const disabled = route.tier === "LOCAL_ONLY" || blocked || busy || !readable;
  return (
    <>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => onConsent(e.target.checked)}
        />
        {t(
          purpose === "public-sources"
            ? "I reviewed this text and approve sending it to Google’s cloud AI for public-source checking with Google Search."
            : "I reviewed this text and approve Firebase AI Logic to prefer on-device AI and send only this text to cloud if local inference is unavailable.",
        )}
      </label>
      <button
        className="primary"
        disabled={disabled || !consent}
        onClick={onSubmit}
      >
        <Cloud size={18} />
        {t(busy ? "Verifying…" : "Approve & verify")}
      </button>
    </>
  );
}
