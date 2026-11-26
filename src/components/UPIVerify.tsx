import { useState } from "react";
import { AlertTriangle, IndianRupee, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

const KNOWN_DOMAINS = new Set([
  "paytm", "ybl", "oksbi", "okaxis", "okicici", "okhdfcbank",
  "upi", "apl", "axl", "barodampay", "cnrb", "federal", "freecharge",
  "hdfcbank", "icici", "idfcbank", "indus", "kotak", "postpaid",
  "rbl", "sbi", "slice", "superyes", "timecosmos", "waaxis",
  "wahdfcbank", "wairtel", "waokaxis", "waoksbi", "yesbank",
  "pthdfc", "ptaxis", "ptyes", "pytm", "jupiteraxis", "mbk", "naviaxis",
  "pnb", "unionbank", "bandhan", "idbi", "aubank", "dlb", "esaf",
]);

type Risk = "safe" | "caution" | "danger";

interface CheckResult {
  risk: Risk;
  flags: string[];
  message: string;
}

function checkUPI(raw: string): CheckResult {
  const id = raw.trim();

  if (!id.includes("@")) {
    return {
      risk: "danger",
      flags: ["Invalid UPI format"],
      message: "This doesn't look like a valid UPI ID. A valid UPI ID contains '@' (e.g. name@upi).",
    };
  }

  const [handle, domain] = id.toLowerCase().split("@");

  if (!handle || !domain) {
    return {
      risk: "danger",
      flags: ["Incomplete UPI ID"],
      message: "UPI ID is incomplete. Example: yourname@upi",
    };
  }

  const scamKeywords =
    /officer|cbi|police|army|collector|govt|government|ministry|income.?tax|customs|investigation|helpdesk|refund|kyc|update|verify|lucky|prize|winner|lottery|reward|claim|bonus|cashback|helpline|support.*bank|bank.*support/i;

  if (scamKeywords.test(handle)) {
    return {
      risk: "danger",
      flags: ["Scam keyword in ID"],
      message:
        "This UPI ID contains words commonly used by scammers — impersonating officials, banks, or prize schemes. Do not send money.",
    };
  }

  const flags: string[] = [];

  if (!KNOWN_DOMAINS.has(domain)) {
    flags.push(`Unknown payment provider "@${domain}"`);
  }

  if (/^\d{10}$/.test(handle)) {
    flags.push("Mobile number UPI — verify the person's identity separately");
  }

  if (flags.length > 0) {
    return {
      risk: "caution",
      flags,
      message:
        "Proceed carefully. Verify the recipient's identity through a separate trusted channel before sending.",
    };
  }

  return {
    risk: "safe",
    flags: ["Recognized format", "No known scam patterns"],
    message:
      "No scam patterns detected. Always confirm who you're paying, especially for amounts above ₹500.",
  };
}

export default function UPIVerify() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  function handleCheck() {
    if (!input.trim()) return;
    setResult(checkUPI(input.trim()));
  }

  return (
    <div className="upi-page">
      <div className="page-heading">
        <span className="eyebrow">
          <span className="tiny-line" />
          BEFORE YOU SEND
        </span>
        <h1>
          UPI <span>Safety Check</span>
        </h1>
        <p>Verify any UPI ID before transferring money. Runs entirely on this device.</p>
      </div>

      <div className="upi-card">
        <div className="upi-input-row">
          <div className="upi-input-wrap">
            <IndianRupee size={18} className="upi-rupee-icon" aria-hidden="true" />
            <input
              type="text"
              className="upi-input"
              placeholder="Enter UPI ID — e.g. name@upi"
              value={input}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setInput(e.target.value);
                setResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCheck()}
              aria-label="UPI ID to verify"
            />
          </div>
          <button
            className="primary upi-check-btn"
            onClick={handleCheck}
            disabled={!input.trim()}
          >
            <Shield size={18} />
            Verify
          </button>
        </div>

        {result && (
          <div className={`upi-result upi-result-${result.risk}`} role="status">
            <div className="upi-result-icon">
              {result.risk === "safe" && <ShieldCheck size={28} />}
              {result.risk === "caution" && <AlertTriangle size={28} />}
              {result.risk === "danger" && <ShieldAlert size={28} />}
            </div>
            <div className="upi-result-body">
              <div className="upi-result-label">
                {result.risk === "safe"
                  ? "No scam patterns found"
                  : result.risk === "caution"
                    ? "Proceed carefully"
                    : "High risk — do not pay"}
              </div>
              <p className="upi-result-msg">{result.message}</p>
              <div className="upi-flags">
                {result.flags.map((f) => (
                  <span key={f} className="upi-flag">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="upi-tips">
          <div className="upi-tip-heading">Red flags when receiving a UPI ID:</div>
          <ul className="upi-tip-list">
            <li>Official-sounding names — CBI, Police, Income Tax, Customs</li>
            <li>Words like "refund", "prize", "claim", "KYC" in the UPI ID</li>
            <li>Unknown payment provider after the @</li>
            <li>Urgency — "pay in 10 minutes or account blocked"</li>
            <li>Asking you to screenshot and share your payment confirmation</li>
          </ul>
          <a href="tel:1930" className="upi-helpline">
            <Shield size={14} />
            Cyber fraud helpline: <strong>1930</strong>
          </a>
        </div>

        <div className="upi-local-note">
          <ShieldCheck size={13} />
          This check runs on your device — no UPI ID is sent anywhere.
        </div>
      </div>
    </div>
  );
}
