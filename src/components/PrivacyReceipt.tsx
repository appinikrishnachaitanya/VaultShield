import { useState } from "react";
import { t } from "../lib/i18n";
import { exportReceipt, type PrivacyReceiptData } from "../lib/receipt";
import type { TokenEntry } from "../lib/tokenVault";
function OriginalPreview({
  original,
  entries,
}: {
  original: string;
  entries: TokenEntry[];
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const e of [...entries].sort((a, b) => a.start - b.start)) {
    if (e.start < cursor) continue;
    parts.push(
      original.slice(cursor, e.start),
      <mark key={e.start}>{original.slice(e.start, e.end)}</mark>,
    );
    cursor = e.end;
  }
  parts.push(original.slice(cursor));
  return <pre>{parts}</pre>;
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
  return (
    <section className="card privacy-receipt" aria-label={t("Privacy receipt")}>
      <h2>{t("Privacy receipt")}</h2>
      <p>
        {t("Cloud reasons over placeholders. This device holds the values.")}
      </p>
      <dl className="receipt-facts">
        <dt>{t("Inference source")}</dt>
        <dd>{t(receipt.source)}</dd>
        <dt>{t("Privacy route")}</dt>
        <dd>{t(receipt.routeTier)}</dd>
        <dt>{t("Elapsed time")}</dt>
        <dd>{(receipt.elapsedMs / 1000).toFixed(2)}s</dd>
        <dt>{t("Outbound AI payload")}</dt>
        <dd>
          {receipt.outboundBytes} {t("bytes")}
        </dd>
        <dt>{t("Images sent")}</dt>
        <dd>{t("No")}</dd>
        <dt>{t("Search grounding used")}</dt>
        <dd>{t(receipt.groundingUsed ? "Yes" : "No")}</dd>
        {receipt.model && (
          <>
            <dt>{t("Cloud model")}</dt>
            <dd>{receipt.model}</dd>
          </>
        )}
        <dt>{t("Tokens")}</dt>
        <dd>
          {Object.entries(receipt.tokenCounts)
            .map(([key, value]) => `${t(key)}: ${value}`)
            .join(" · ") || "0"}
        </dd>
      </dl>
      <p>{t(receipt.storageStatement)}</p>
      <p className="tool-hint">
        {t(receipt.storageScope)}.{" "}
        {t(
          "Account settings and family connections are separate service data.",
        )}
      </p>
      <details>
        <summary>{t("What left your device")}</summary>
        <div className="receipt-comparison">
          <div>
            <h3>{t("Original · device only")}</h3>
            <OriginalPreview original={original} entries={entries} />
          </div>
          <div>
            <h3>{t("Exact outbound AI payload")}</h3>
            <pre>
              {receipt.outboundText || t("Nothing sent for this analysis.")}
            </pre>
          </div>
        </div>
      </details>
      <div className="tool-actions">
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(exportReceipt(receipt))
              .then(() => setStatus("Receipt copied."))
              .catch(() =>
                setStatus("Could not copy receipt. Use Download instead."),
              )
          }
        >
          {t("Copy receipt")}
        </button>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportReceipt(receipt)], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "vaultshield-receipt.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          {t("Download receipt (JSON)")}
        </button>
      </div>
      <p role="status">{t(status)}</p>
    </section>
  );
}
