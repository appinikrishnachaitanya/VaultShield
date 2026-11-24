import { useState } from "react";
import { pressureEvidenceParts } from "../lib/pressureEvidence";
import type { LocalResult } from "../types/privacy";

export default function PressureEvidence({ result }: { result: LocalResult }) {
  const [copyNotice, setCopyNotice] = useState("");
  const help =
    "Please call me on my saved number. I received a suspicious request and want help verifying it before taking any action.";
  return (
    <section
      className="card pressure-evidence"
      aria-label="Redacted message and trusted verification"
    >
      <h3>Pause & understand</h3>
      <p>
        Review this redacted preview for missed private details. Highlights mark
        matching evidence, not proof of fraud.
      </p>
      <div className="evidence-message">
        {pressureEvidenceParts(result.text, result.stages).map((part, index) =>
          part.stage ? (
            <mark key={index} className={`tactic-${part.stage.toLowerCase()}`}>
              <span className="tactic-label">{part.stage}: </span>
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </div>
      <details className="source-details">
        <summary>How to find a trusted contact</summary>
        <ul>
          <li>
            For a bank, open its app yourself or use the number printed on your
            bank card.
          </li>
          <li>
            For an organisation, type its known official website. Do not trust a
            number just because it appears in a search result or AI answer.
          </li>
          <li>
            For a family emergency, call their saved number and ask your agreed
            family safe-word.
          </li>
        </ul>
        <p>
          Do not use the suspicious message’s number or link as your
          verification route.
        </p>
      </details>
      <details className="source-details">
        <summary>Ask for help another way</summary>
        <p>
          If family pairing or notifications are unavailable, copy this message
          and send it yourself to someone you trust. Copying does not send
          anything.
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
            Copy help message
          </button>
        </div>
        {copyNotice && <p role="status">{copyNotice}</p>}
      </details>
    </section>
  );
}
