import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { TokenVaultSession } from "../lib/tokenVault";
import { t } from "../lib/i18n";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "token"; token: string; original: string; category: string; idx: number };

const TOKEN_COLORS: Record<string, string> = {
  PERSON: "tok-person",
  PHONE: "tok-phone",
  EMAIL: "tok-email",
  AADHAAR: "tok-aadhaar",
  PAN: "tok-pan",
  BANK_ACC: "tok-bank",
  IFSC: "tok-bank",
  UPI: "tok-upi",
  AMOUNT: "tok-amount",
  OTP: "tok-otp",
  URL: "tok-url",
  ORG: "tok-org",
  REFERENCE: "tok-ref",
  PRIVATE: "tok-private",
};

const CATEGORY_LABEL: Record<string, string> = {
  PERSON: "Name",
  PHONE: "Phone",
  EMAIL: "Email",
  AADHAAR: "Aadhaar",
  PAN: "PAN",
  BANK_ACC: "Bank Acc",
  IFSC: "IFSC",
  UPI: "UPI ID",
  AMOUNT: "Amount",
  OTP: "OTP",
  URL: "Link",
  ORG: "Organisation",
  REFERENCE: "Ref No.",
  PRIVATE: "Private",
};

function tokenCategory(token: string): string {
  const match = token.match(/^\[([A-Z_]+)_\d+/);
  return match ? match[1] : "PRIVATE";
}

function buildSegments(tokenized: string, entries: { original: string; token: string }[]): Segment[] {
  const segments: Segment[] = [];
  let remaining = tokenized;
  let tokenIdx = 0;
  while (remaining.length > 0) {
    const tokenMatch = remaining.match(/^\[([A-Z_]+_\d+(?::[^\]]+)?)\]/);
    if (tokenMatch) {
      const fullToken = tokenMatch[0];
      const entry = entries.find((e) => e.token === fullToken);
      segments.push({
        kind: "token",
        token: fullToken,
        original: entry?.original ?? "…",
        category: tokenCategory(fullToken),
        idx: tokenIdx++,
      });
      remaining = remaining.slice(fullToken.length);
    } else {
      const nextToken = remaining.search(/\[[A-Z_]+_\d+/);
      const textEnd = nextToken === -1 ? remaining.length : nextToken;
      segments.push({ kind: "text", value: remaining.slice(0, textEnd) });
      remaining = remaining.slice(textEnd);
    }
  }
  return segments;
}

type CategoryCount = { category: string; count: number };

function buildCategoryCounts(entries: { category: string }[]): CategoryCount[] {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + 1);
  return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
}

type Props = { input: string };

export default function TokenVaultPreview({ input }: Props) {
  const vaultRef = useRef(new TokenVaultSession());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [catCounts, setCatCounts] = useState<CategoryCount[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    clearTimeout(scanRef.current);
    if (!input.trim()) {
      setSegments([]);
      setCatCounts([]);
      setTokenCount(0);
      setScanning(false);
      return;
    }
    setScanning(true);
    timerRef.current = setTimeout(() => {
      vaultRef.current.clear();
      const result = vaultRef.current.tokenize(input);
      const rawEntries = vaultRef.current.entries();
      const entries = rawEntries.map((e) => ({
        original: e.original,
        token: e.token,
        category: e.category as string,
      }));
      setSegments(buildSegments(result.text, entries));
      setCatCounts(buildCategoryCounts(entries));
      setTokenCount(entries.length);
      setScanning(false);
    }, 400);
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(scanRef.current);
    };
  }, [input]);

  if (!input.trim()) return null;

  if (scanning) {
    return (
      <div className="vault-preview vault-scanning-box">
        <div className="vault-scanning-indicator">
          <ShieldCheck size={13} className="vault-scan-icon" />
          <span>{t("Scanning for personal data")}<span className="vault-scan-dots" /></span>
        </div>
      </div>
    );
  }

  if (tokenCount === 0) return null;

  return (
    <div className="vault-preview">
      <div className="vault-preview-header">
        <ShieldCheck size={13} />
        <span>
          {t("Privacy Shield active")} —{" "}
          <strong>
            {tokenCount} identifier{tokenCount !== 1 ? "s" : ""} protected
          </strong>
        </span>
      </div>
      <div className="vault-detected-row">
        {catCounts.map(({ category, count }) => (
          <span
            key={category}
            className={`vault-det-chip ${TOKEN_COLORS[category] ?? "tok-private"}`}
            title={`${count} ${CATEGORY_LABEL[category] ?? category} value${count !== 1 ? "s" : ""} masked`}
          >
            {CATEGORY_LABEL[category] ?? category}
            {count > 1 && <span className="chip-count"> ×{count}</span>}
          </span>
        ))}
      </div>
      <p className="vault-preview-text">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <span
              key={i}
              className={`vault-token ${TOKEN_COLORS[seg.category] ?? "tok-private"}`}
              style={{ animationDelay: `${seg.idx * 60}ms` }}
              title={`Original: "${seg.original}"`}
            >
              {seg.token}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
