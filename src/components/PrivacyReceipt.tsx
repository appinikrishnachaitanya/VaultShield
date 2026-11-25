import { useState } from "react";
import {
  ShieldCheck,
  FileCheck2,
  ArrowUpRight,
  Clock3,
  Copy,
  Download,
  ChevronDown,
  Check,
  LockKeyhole,
} from "lucide-react";
import { t, useAppLanguage } from "../lib/i18n";
import { exportReceipt, type PrivacyReceiptData } from "../lib/receipt";
import { privacyCategoryLabel } from "../lib/privacyLabels";
import type { TokenEntry } from "../lib/tokenVault";
const sourceLabels = {
  "ON-DEVICE": "On-device AI",
  "HYBRID-ON-DEVICE": "Hybrid · on this device",
  "HYBRID-CLOUD-FALLBACK": "Hybrid · cloud fallback",
  "CLOUD-PUBLIC-SOURCE": "Cloud · public sources",
  "LOCAL RULES": "Basic text check · not AI",
} as const;
function OriginalPreview({
  original,
  entries,
}: {
  original: string;
  entries: TokenEntry[];
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const entry of [...entries].sort((a, b) => a.start - b.start)) {
    if (entry.start < cursor) continue;
    parts.push(
      original.slice(cursor, entry.start),
      <mark key={entry.start}>{original.slice(entry.start, entry.end)}</mark>,
    );
    cursor = entry.end;
  }
  parts.push(original.slice(cursor));
  return (
    <pre>{original ? parts : t("Original image stays on this device.")}</pre>
  );
}
export default function PrivacyReceipt({
  receipt,
  original,
  entries,
}: {
  receipt: PrivacyReceiptData;
  original: string;
  entries: TokenEntry[];
}) {
  const [status, setStatus] = useState("");
  const language = useAppLanguage();
  const cloud =
    receipt.source === "HYBRID-CLOUD-FALLBACK" ||
    receipt.source === "CLOUD-PUBLIC-SOURCE";
  const total = Object.values(receipt.tokenCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const elapsed =
    receipt.elapsedMs < 10
      ? "< 0.01 s"
      : `${(receipt.elapsedMs / 1000).toFixed(2)} s`;
  const route =
    receipt.routeTier === "LOCAL_ONLY"
      ? "Local by default"
      : receipt.routeTier === "TOKENIZE_THEN_CLOUD_OK"
        ? "Tokenized · review required"
        : "No identifiers detected";
  return (
    <section
      className={`card privacy-receipt ${cloud ? "receipt-cloud" : "receipt-local"}`}
      aria-label={t("Privacy receipt")}
    >
      <header className="receipt-heading">
        <span className="receipt-icon">
          <FileCheck2 size={25} aria-hidden="true" />
        </span>
        <div>
          <h2>{t("Privacy receipt")}</h2>
          <p>{t("A clear record of this check.")}</p>
        </div>
        <span
          className={`receipt-source ${receipt.source === "LOCAL RULES" ? "receipt-source-rules" : ""}`}
        >
          {t(sourceLabels[receipt.source])}
        </span>
      </header>
      <div className="receipt-outcome">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h3>
            {t(
              cloud
                ? "Only your approved text was submitted"
                : "No message sent to cloud AI",
            )}
          </h3>
          <p>
            {t(
              cloud
                ? "Your original and token mapping stayed on this device."
                : "This analysis ran on your device. Your original was not uploaded.",
            )}
          </p>
        </div>
      </div>
      <dl className="receipt-metrics">
        <div>
          <dt>
            <ArrowUpRight size={16} aria-hidden="true" />
            {t("Sent to cloud AI")}
          </dt>
          <dd>
            {receipt.outboundBytes.toLocaleString(
              language === "hi" ? "hi-IN" : "en-IN",
            )}{" "}
            <span>{t("bytes")}</span>
          </dd>
        </div>
        <div>
          <dt>
            <LockKeyhole size={16} aria-hidden="true" />
            {t("Details replaced")}
          </dt>
          <dd>
            {total}
            <span>{t("in this preview")}</span>
          </dd>
        </div>
        <div>
          <dt>
            <Clock3 size={16} aria-hidden="true" />
            {t("Check time")}
          </dt>
          <dd>{elapsed}</dd>
        </div>
      </dl>
      <section className="receipt-masking">
        <h3>{t("Masked details")}</h3>
        {total ? (
          <div className="receipt-token-list">
            {Object.entries(receipt.tokenCounts).map(([category, count]) => (
              <span className="receipt-token" key={category}>
                {t(privacyCategoryLabel(category))}
                <b>{count}</b>
              </span>
            ))}
          </div>
        ) : (
          <p>
            {t(
              "No recognized identifiers were replaced. Review the text manually.",
            )}
          </p>
        )}
      </section>
      <details className="receipt-disclosure">
        <summary>
          <span>{t("What left your device")}</span>
          <ChevronDown size={19} aria-hidden="true" />
        </summary>
        <p className="receipt-explanation">
          {t(
            "The original preview below is local. Exports contain only metadata and the approved tokenized request.",
          )}
        </p>
        <div className="receipt-comparison">
          <div>
            <h4>{t("Original · device only")}</h4>
            <OriginalPreview original={original} entries={entries} />
          </div>
          <div>
            <h4>{t("Exact outbound AI payload")}</h4>
            <pre>
              {receipt.outboundText || t("Nothing sent for this analysis.")}
            </pre>
          </div>
        </div>
      </details>
      <details className="receipt-disclosure">
        <summary>
          <span>{t("Analysis details")}</span>
          <ChevronDown size={19} aria-hidden="true" />
        </summary>
        <dl className="receipt-facts">
          <div>
            <dt>{t("Where this ran")}</dt>
            <dd>{t(sourceLabels[receipt.source])}</dd>
          </div>
          <div>
            <dt>{t("Privacy route")}</dt>
            <dd>{t(route)}</dd>
          </div>
          <div>
            <dt>{t("Images sent")}</dt>
            <dd>{t("No")}</dd>
          </div>
          <div>
            <dt>{t("Search grounding used")}</dt>
            <dd>{t(receipt.groundingUsed ? "Yes" : "No")}</dd>
          </div>
          {receipt.model && (
            <div>
              <dt>{t("Cloud model")}</dt>
              <dd>{receipt.model}</dd>
            </div>
          )}
          <div>
            <dt>{t("Sensitive-content override approved")}</dt>
            <dd>{t(receipt.sensitiveOverrideApproved ? "Yes" : "No")}</dd>
          </div>
          <div>
            <dt>{t("Receipt time")}</dt>
            <dd>
              {new Date(receipt.timestamp).toLocaleString(
                language === "hi" ? "hi-IN" : "en-IN",
              )}
            </dd>
          </div>
        </dl>
      </details>
      <div className="receipt-storage">
        <LockKeyhole size={18} aria-hidden="true" />
        <p>
          <strong>{t("Original content was not saved")}</strong>
          <span>
            {t(receipt.storageScope)}.{" "}
            {t(
              "Account settings and family connections are separate service data.",
            )}
          </span>
        </p>
      </div>
      <footer className="receipt-actions">
        <button
          className="secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(exportReceipt(receipt))
              .then(() => setStatus("Receipt copied."))
              .catch(() =>
                setStatus("Could not copy receipt. Use Download instead."),
              )
          }
        >
          {status === "Receipt copied." ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
          {t("Copy receipt")}
        </button>
        <button
          className="secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportReceipt(receipt)], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "vaultshield-receipt.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={18} aria-hidden="true" />
          {t("Download receipt (JSON)")}
        </button>
      </footer>
      {status && (
        <p className="receipt-feedback" role="status">
          {t(status)}
        </p>
      )}
    </section>
  );
}
