import { useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  Globe,
  Lock,
  LockKeyhole,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase/config";
import { stopLocalReading } from "../lib/localVoice";
import { APP_LANGUAGES, setLanguage, t, useAppLanguage, type AppLanguage } from "../lib/i18n";
import { hasPinSet, isUnlocked, lock as lockDiary } from "../lib/diaryStore";
import { ChangePinDialog } from "./PrivateDiary";

export default function SettingsPage({ onNavigate }: { onNavigate: (tab: "diary" | "family" | "privacy") => void }) {
  const appLanguage = useAppLanguage();
  const [signedIn, setSignedIn] = useState(false);
  const [diaryPinSet, setDiaryPinSet] = useState<boolean | null>(null);
  const [diaryUnlocked, setDiaryUnlocked] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user));
      if (!user) { setDiaryPinSet(null); return; }
      setDiaryUnlocked(isUnlocked());
      void hasPinSet().then(setDiaryPinSet).catch(() => setDiaryPinSet(null));
    });
    return unsubscribe;
  }, []);

  return (
    <div className="settings-page">
      {showChangePin && <ChangePinDialog onClose={() => setShowChangePin(false)} />}

      <div className="page-heading">
        <span className="eyebrow">
          <SettingsIcon size={13} />
          {t("Settings")}
        </span>
        <h1>{t("Set up VaultShield")}</h1>
        <p>{t("Everything that controls how the app works for you, in one place.")}</p>
      </div>

      <section className="settings-section">
        <div className="settings-section-title">
          <Globe size={16} />
          {t("Language")}
        </div>
        <p className="settings-section-sub">{t("Your language")}</p>
        <div className="settings-language-row">
          {APP_LANGUAGES.map((entry) => (
            <button
              key={entry.code}
              className={`settings-lang-btn${appLanguage === entry.code ? " active" : ""}`}
              onClick={() => { setLanguage(entry.code as AppLanguage); stopLocalReading(); }}
            >
              {entry.nativeLabel}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <LockKeyhole size={16} />
          {t("Private Diary")}
        </div>
        {!signedIn ? (
          <p className="settings-section-sub">{t("Sign in to sync your private diary and family circle across devices.")}</p>
        ) : diaryPinSet === null ? (
          <p className="settings-section-sub">…</p>
        ) : !diaryPinSet ? (
          <>
            <p className="settings-section-sub">{t("No PIN set up yet — your entries aren't encrypted until you do.")}</p>
            <button className="settings-row-btn" onClick={() => onNavigate("diary")}>
              <span>{t("Set up a diary PIN")}</span>
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            <p className="settings-section-sub">
              {diaryUnlocked ? t("Your diary is currently unlocked in this tab.") : t("Your diary is locked.")}
            </p>
            <button className="settings-row-btn" onClick={() => setShowChangePin(true)}>
              <span>{t("Change PIN")}</span>
              <ChevronRight size={16} />
            </button>
            {diaryUnlocked && (
              <button
                className="settings-row-btn"
                onClick={() => { lockDiary(); setDiaryUnlocked(false); }}
              >
                <span><Lock size={14} /> {t("Lock diary now")}</span>
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <Users size={16} />
          {t("Family circle")}
        </div>
        <p className="settings-section-sub">{t("People & notifications")}</p>
        <button className="settings-row-btn" onClick={() => onNavigate("family")}>
          <span><Bell size={14} /> {t("Open family circle")}</span>
          <ChevronRight size={16} />
        </button>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <ShieldCheck size={16} />
          {t("Privacy & Data")}
        </div>
        <p className="settings-section-sub">{t("Here’s exactly what stays and what leaves.")}</p>
        <button className="settings-row-btn" onClick={() => onNavigate("privacy")}>
          <span>{t("Your privacy")}</span>
          <ChevronRight size={16} />
        </button>
      </section>
    </div>
  );
}
