import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { TokenVaultSession } from "../lib/tokenVault";
import { t } from "../lib/i18n";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "token"; token: string; original: string; category: string };

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

function tokenCategory(token: string): string {
  const match = token.match(/^\[([A-Z_]+)_\d+/);
  return match ? match[1] : "PRIVATE";
}

function buildSegments(original: string, tokenized: string, entries: { original: string; token: string }[]): Segment[] {
  if (!entries.length) return [{ kind: "text", value: original }];
  const segments: Segment[] = [];
  let remaining = tokenized;
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

type Props = {
  input: string;
};

export default function TokenVaultPreview({ input }: Props) {
  const vaultRef = useRef(new TokenVaultSession());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!input.trim()) {
      setSegments([]);
      setTokenCount(0);
      return;
    }
    timerRef.current = setTimeout(() => {
      vaultRef.current.clear();
      const result = vaultRef.current.tokenize(input);
      const entries = vaultRef.current.entries().map((e) => ({
        original: e.original,
        token: e.token,
      }));
      setSegments(buildSegments(input, result.text, entries));
      setTokenCount(entries.length);
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [input]);

  if (!input.trim() || tokenCount === 0) return null;

  return (
    <div className="vault-preview">
      <div className="vault-preview-header">
        <Lock size={13} />
        <span>
          {t("What AI sees")} —{" "}
          <strong>
            {tokenCount} identifier{tokenCount !== 1 ? "s" : ""} masked
          </strong>
        </span>
      </div>
      <p className="vault-preview-text">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <span
              key={i}
              className={`vault-token ${TOKEN_COLORS[seg.category] ?? "tok-private"}`}
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
