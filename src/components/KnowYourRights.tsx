import { useState } from "react";
import { ChevronDown, ChevronUp, Scale } from "lucide-react";

const RIGHTS = [
  {
    id: "digital_arrest",
    title: "Digital Arrest",
    icon: "🚨",
    headline: "'Digital arrest' has no legal basis in India.",
    color: "#ef4444",
    bg: "#fef2f2",
    facts: [
      "No Indian law — IPC, CrPC, or IT Act — permits 'digital arrest'.",
      "The CBI, Narcotics Bureau, Customs, and courts cannot arrest anyone over a video call.",
      "No court issues warrants through WhatsApp, Telegram, or any messaging app.",
      "You are never legally required to remain on a video call with a stranger.",
      "If you receive such a call, you may hang up. That is not a crime.",
    ],
    action: "Hang up and call the real cybercrime helpline: 1930",
  },
  {
    id: "otp",
    title: "OTP & Account Security",
    icon: "🔐",
    headline: "No legitimate organization will ever ask for your OTP.",
    color: "#f59e0b",
    bg: "#fffbeb",
    facts: [
      "Banks, UPI apps, and government services generate OTPs only for your own use.",
      "An OTP is a one-time password — sharing it is equivalent to giving away your account.",
      "Real bank employees never ask for your OTP, PIN, CVV, or card expiry over a call.",
      "If someone says they need your OTP to 'verify' or 'refund' — that is the scam.",
    ],
    action: "Never share OTPs. End the call and report to 1930.",
  },
  {
    id: "police",
    title: "Police & Legal Threats",
    icon: "⚖️",
    headline: "Real police do not threaten arrests over phone or video.",
    color: "#6366f1",
    bg: "#eef2ff",
    facts: [
      "Police must follow due process — written notices, court orders, physical presence.",
      "A real summons arrives by post or is served in person — never through WhatsApp.",
      "No police officer can demand money over a call to 'settle' a case.",
      "Any demand for money over the phone from a 'police officer' is a criminal scam.",
      "You have the right to call your local police station to verify any threat.",
    ],
    action: "Call your local police station on their official number to verify.",
  },
  {
    id: "kyc",
    title: "KYC & Account Freeze",
    icon: "🏦",
    headline: "KYC is never done by clicking a link or sharing an OTP.",
    color: "#0ea5e9",
    bg: "#f0f9ff",
    facts: [
      "Banks are required to give advance written notice before freezing any account.",
      "KYC updates happen in a branch, on the official bank app, or official website — not via SMS links.",
      "No bank will freeze your account instantly without prior formal notification.",
      "If your account were truly frozen, you would receive official written communication first.",
    ],
    action: "Call the number on the back of your debit card to verify any bank claim.",
  },
  {
    id: "privacy",
    title: "Your Data Privacy Rights",
    icon: "🛡️",
    headline: "You have legal rights over your personal data.",
    color: "#10b981",
    bg: "#ecfdf5",
    facts: [
      "Under India's DPDP Act 2023, you have the right to know what data companies hold about you.",
      "You have the right to correct or erase your personal data held by digital platforms.",
      "Sharing Aadhaar — except for required government purposes — is optional in most cases.",
      "No private company can demand your Aadhaar just to send you a prize or refund.",
      "You can file a complaint with India's Data Protection Board for violations.",
    ],
    action: "Report data misuse at cybercrime.gov.in",
  },
];

export default function KnowYourRights() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rights-section">
      <div className="rights-header">
        <Scale size={20} />
        <div>
          <strong>Know Your Rights</strong>
          <span>What scammers hope you don't know</span>
        </div>
      </div>

      <div className="rights-list">
        {RIGHTS.map((r) => {
          const open = expanded === r.id;
          return (
            <div
              key={r.id}
              className={`rights-item${open ? " open" : ""}`}
              style={{ borderLeftColor: r.color }}
            >
              <button
                className="rights-item-toggle"
                onClick={() => setExpanded(open ? null : r.id)}
                aria-expanded={open}
              >
                <span className="rights-item-icon">{r.icon}</span>
                <div className="rights-item-title-wrap">
                  <span className="rights-item-title">{r.title}</span>
                  <span className="rights-item-headline">{r.headline}</span>
                </div>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {open && (
                <div className="rights-item-body" style={{ background: r.bg }}>
                  <ul className="rights-facts">
                    {r.facts.map((f, i) => (
                      <li key={i}>
                        <span className="rights-bullet" style={{ background: r.color }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="rights-action" style={{ color: r.color }}>
                    <strong>What to do:</strong> {r.action}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rights-footer">
        <a href="tel:1930" className="rights-helpline">
          Cybercrime helpline: <strong>1930</strong> (free, 24/7)
        </a>
        <a
          href="https://cybercrime.gov.in"
          target="_blank"
          rel="noopener noreferrer"
          className="rights-portal"
        >
          cybercrime.gov.in →
        </a>
      </div>
    </div>
  );
}
