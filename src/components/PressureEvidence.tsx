import { t } from "../lib/i18n";
import { useState } from "react";
import { pressureEvidenceParts } from "../lib/pressureEvidence";
import type { LocalResult } from "../types/privacy";

export default function PressureEvidence({ result }: { result: LocalResult }) {
  const [copyNotice, setCopyNotice] = useState("");
  const help = t(
    "Please call me on my saved number. I received a suspicious request and want help verifying it before taking any action.",
  );
  return (
    <section
      className="card pressure-evidence"
      aria-label={t("Redacted message and trusted verification")}
    >
      <h3>{t("Pause & understand")}</h3>
      <p>
        {t(
          " Review this redacted preview for missed private details. Highlights mark matching evidence, not proof of fraud. ",
        )}
      </p>
      <div className="evidence-message">
        {pressureEvidenceParts(result.text, result.stages).map((part, index) =>
          part.stage ? (
            <mark key={index} className={`tactic-${part.stage.toLowerCase()}`}>
              <span className="tactic-label">{t(part.stage)}: </span>
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </div>
      <details className="source-details">
        <summary>{t("How to find a trusted contact")}</summary>
        <ul>
          <li>
            {t(
              " For a bank, open its app yourself or use the number printed on your bank card. ",
            )}
          </li>
          <li>
            {t(
              " For an organisation, type its known official website. Do not trust a number just because it appears in a search result or AI answer. ",
            )}
          </li>
          <li>
            {t(
              " For a family emergency, call their saved number and ask your agreed family safe-word. ",
            )}
          </li>
        </ul>
        <p>
          {t(
            " Do not use the suspicious message’s number or link as your verification route. ",
          )}
        </p>
      </details>
      <details className="source-details">
        <summary>{t("Ask for help another way")}</summary>
        <p>
          {t(
            " If family pairing or notifications are unavailable, copy this message and send it yourself to someone you trust. Copying does not send anything. ",
          )}
        </p>
        <p className="help-message">{help}</p>
        <div className="tool-actions">
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(help);
                setCopyNotice(
                  "Help message copied. Choose a trusted recipient and send it yourself.",
                );
              } catch {
                setCopyNotice(
                  "Clipboard unavailable. Select and copy the help message above.",
                );
              }
            }}
          >
            {t(" Copy help message ")}
          </button>
        </div>
        {copyNotice && <p role="status">{t(copyNotice)}</p>}
      </details>
    </section>
  );
}
