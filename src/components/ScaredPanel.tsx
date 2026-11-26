import { useState } from "react";
import { ChevronRight, Phone, Shield, ShieldAlert, Users, X } from "lucide-react";
import { sendAlert } from "../lib/firebase/family";

const SCAM_TYPES = [
  {
    id: "digital_arrest",
    label: "Digital Arrest / CBI Call",
    icon: "🚨",
    immediate: "End the call right now. You have broken no law.",
    guidance: [
      "The CBI, police, and courts NEVER conduct arrests over video call.",
      "No Indian law permits 'digital arrest'. It does not exist.",
      "You are not legally required to stay on this call.",
      "Hanging up cannot get you arrested. Staying on can cost you money.",
    ],
  },
  {
    id: "kyc",
    label: "Fake KYC / Bank Freeze",
    icon: "🏦",
    immediate: "Hang up. Call your bank on the number printed on your card.",
    guidance: [
      "No bank freezes an account without sending a formal written notice first.",
      "Real bank employees never ask for your OTP, PIN, or card number.",
      "KYC is never updated by clicking a link sent by a stranger.",
      "If in doubt, walk into your nearest branch.",
    ],
  },
  {
    id: "fedex",
    label: "FedEx / Courier Drug Scam",
    icon: "📦",
    immediate: "End the call. No package linked to you exists.",
    guidance: [
      "No courier company calls to report illegal items in your name.",
      "Real police investigations never happen over WhatsApp video calls.",
      "No courier firm asks for a 'security deposit' or 'clearing fee'.",
      "This exact scam has defrauded thousands of Indians — you are not alone in receiving it.",
    ],
  },
  {
    id: "lottery",
    label: "Lottery / Prize / Reward",
    icon: "🎰",
    immediate: "Block the number. The prize does not exist.",
    guidance: [
      "You cannot win a lottery you did not enter.",
      "Real prizes never require upfront payment of any kind.",
      "No government lottery operates through WhatsApp or Telegram.",
      "Scammers count on excitement — pause before you act.",
    ],
  },
  {
    id: "family",
    label: "Fake Family Emergency",
    icon: "👨‍👩‍👧",
    immediate: "Call that family member directly on their saved number now.",
    guidance: [
      "Call the person the scammer is impersonating — on their real number.",
      "Use your agreed family safe-word if you have one.",
      "Real emergencies can be confirmed with one phone call.",
      "Scammers depend on you acting before you verify — take 30 seconds.",
    ],
  },
];

interface Props {
  members: { id: string; name: string }[];
  onClose: () => void;
}

export default function ScaredPanel({ members, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [alertSent, setAlertSent] = useState(false);

  const scam = SCAM_TYPES.find((s) => s.id === selected);

  async function alertFamily() {
    try {
        await sendAlert(1);
      setAlertSent(true);
    } catch {
      // best-effort silent fail
    }
  }

  return (
    <div
      className="scared-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Emergency safety guidance"
    >
      <div className="scared-panel">
        <button className="scared-close" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>

        <div className="scared-header">
          <ShieldAlert size={30} className="scared-icon" />
          <h2>You are safe.</h2>
          <p>
            Whatever they told you — you have not broken any law. Take a breath.
          </p>
        </div>

        <div className="scared-stop-banner">
          <Shield size={16} />
          Do <strong>NOT</strong> pay anything or share any OTP right now.
        </div>

        {!selected ? (
          <>
            <div className="scared-select-label">What's happening?</div>
            <div className="scared-types">
              {SCAM_TYPES.map((s) => (
                <button
                  key={s.id}
                  className="scared-type-btn"
                  onClick={() => setSelected(s.id)}
                >
                  <span className="scared-type-icon">{s.icon}</span>
                  <span>{s.label}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="scared-guidance-view">
            <button className="scared-back" onClick={() => setSelected(null)}>
              ← Back
            </button>
            <div className="scared-guidance-title">
              <span>{scam?.icon}</span> {scam?.label}
            </div>
            <div className="scared-immediate-action">{scam?.immediate}</div>
            <ul className="scared-facts">
              {scam?.guidance.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}

        <div className="scared-action-row">
          <a href="tel:1930" className="scared-call-btn">
            <Phone size={18} />
            Cybercrime Helpline 1930
          </a>
          {members.length > 0 && (
            <button
              className="scared-family-btn"
              onClick={() => void alertFamily()}
              disabled={alertSent}
            >
              <Users size={18} />
              {alertSent ? "Family alerted ✓" : "Alert my family"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
