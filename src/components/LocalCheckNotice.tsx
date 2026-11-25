import { CircleAlert, ChevronDown } from "lucide-react";
import { t } from "../lib/i18n";
import type { LocalResult } from "../types/privacy";
import type { localAIDiagnostics } from "../services/aiCapability";
type Diagnostics = Awaited<ReturnType<typeof localAIDiagnostics>>;
export default function LocalCheckNotice({
  result,
  diagnostics,
  checking,
  disabled,
  onCheck,
}: {
  result: LocalResult;
  diagnostics?: Diagnostics;
  checking: boolean;
  disabled: boolean;
  onCheck: () => Promise<void>;
}) {
  if (result.source !== "LOCAL_RULES" && !result.fallbackReason) return null;
  return (
    <section
      className="local-check-notice"
      aria-label={t("About this basic check")}
    >
      <div className="notice-heading">
        <CircleAlert size={22} aria-hidden="true" />
        <div>
          <h3>{t("A basic text check is ready")}</h3>
          <p>{t("AI could not run here, so this result uses local rules.")}</p>
        </div>
      </div>
      <p className="notice-review">
        {t(
          "Local AI did not run. Names and addresses were checked only by limited rules. Review them manually.",
        )}
      </p>
      <details className="notice-diagnostics">
        <summary>
          <span>{t("Why AI did not run")}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        {result.fallbackReason && <p>{t(result.fallbackReason)}</p>}
        <dl className="notice-facts">
          <div>
            <dt>{t("Last step:")}</dt>
            <dd>{t(result.fallbackStage ?? "")}</dd>
          </div>
          {result.fallbackCode && (
            <div>
              <dt>{t("Error code")}</dt>
              <dd>{result.fallbackCode}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          className="secondary"
          disabled={checking || disabled}
          onClick={() => void onCheck()}
        >
          {t(checking ? "Checking browser support…" : "Check local AI support")}
        </button>
        {diagnostics && (
          <>
            <dl className="notice-facts">
              <div>
                <dt>{t("Platform")}</dt>
                <dd>{diagnostics.platform}</dd>
              </div>
              <div>
                <dt>{t("Secure page")}</dt>
                <dd>{t(diagnostics.securePage ? "Yes" : "No")}</dd>
              </div>
              <div>
                <dt>{t("Chrome Prompt API exposed")}</dt>
                <dd>{t(diagnostics.promptApiExposed ? "Yes" : "No")}</dd>
              </div>
              <div>
                <dt>{t("Text model")}</dt>
                <dd>{t(diagnostics.text)}</dd>
              </div>
              <div>
                <dt>{t("Image model")}</dt>
                <dd>{t(diagnostics.image)}</dd>
              </div>
            </dl>
            {diagnostics.promptApiExposed &&
              diagnostics.text !== "available" && (
                <p>
                  {t(
                    "The browser exposes the API, but its text model is not ready for this request.",
                  )}
                </p>
              )}
          </>
        )}
      </details>
    </section>
  );
}
