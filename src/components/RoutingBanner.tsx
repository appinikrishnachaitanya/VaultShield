import { t } from "../lib/i18n";
import type { PrivacyRoute } from "../lib/router";
export default function RoutingBanner({ route }: { route: PrivacyRoute }) {
  return (
    <section
      className={`routing-banner route-${route.tier}`}
      aria-label={t("Privacy route")}
      role="status"
    >
      <strong>
        {t(
          route.tier === "LOCAL_ONLY"
            ? "Local by default"
            : route.tier === "TOKENIZE_THEN_CLOUD_OK"
              ? "Will be tokenized before leaving"
              : "No identifiers detected",
        )}
      </strong>
      <p>{route.reasons.map((reason) => t(reason)).join(" · ")}</p>
      <p>
        {t(
          route.tier === "LOCAL_ONLY"
            ? route.overrideAllowed
              ? "Cloud stays off unless you review the tokens and explicitly override this restriction."
              : "An image must be read locally before any text can be reviewed."
            : "Review the tokens and approve the text before any cloud-capable analysis.",
        )}
      </p>
    </section>
  );
}
