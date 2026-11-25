import { t } from "../lib/i18n";
import { Info, CircleAlert } from "lucide-react";
import type { LeakResult } from "../lib/leakTest";
import { privacyCategoryLabel } from "../lib/privacyLabels";
export default function LeakTestPanel({
  result,
  text,
}: {
  result: LeakResult;
  text: string;
}) {
  const spans = [...result.findings].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const parts: React.ReactNode[] = [];
  for (const span of spans) {
    if (span.start < cursor) continue;
    parts.push(
      text.slice(cursor, span.start),
      <mark key={span.start}>{text.slice(span.start, span.end)}</mark>,
    );
    cursor = span.end;
  }
  parts.push(text.slice(cursor));
  return (
    <section
      className={`review-leakcheck ${result.blocked ? "is-blocked" : result.status === "WARN" ? "has-warning" : ""}`}
      aria-label={t("Leak test")}
      role="status"
    >
      {result.blocked ? (
        <CircleAlert size={19} aria-hidden="true" />
      ) : (
        <Info size={19} aria-hidden="true" />
      )}
      <div>
        <strong>
          {t(
            result.blocked
              ? "Remove these private details"
              : "A final privacy review",
          )}
        </strong>
        <p>
          {t(
            result.blocked
              ? "A known private value remains. Remove the highlighted text before approving."
              : result.status === "WARN"
                ? "Review these possible identifiers before approving."
                : "No known patterns found. Names and addresses are not fully detected. Review manually.",
          )}
        </p>
        {result.findings.length > 0 && (
          <>
            <p>
              {[
                ...new Set(
                  result.findings.map((f) =>
                    t(privacyCategoryLabel(f.category)),
                  ),
                ),
              ].join(" · ")}
            </p>
            <pre className="leak-preview">{parts}</pre>
          </>
        )}
      </div>
    </section>
  );
}
