import { useEffect, useRef, useState } from "react";
import {
  LogOut,
  Settings,
  UserRound,
  X,
  Chrome,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase/config";
import {
  continueWithGoogle,
  ExistingAccount,
  openExistingAccount,
  leaveAccount,
} from "../lib/firebase/account";
import { t, setLanguage, useAppLanguage } from "../lib/i18n";

/** Deterministic avatar background from uid */
function avatarColor(uid: string): string {
  const palette = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#0ea5e9",
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "U").toUpperCase();
}

export default function Account() {
  const language = useAppLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [settingsMode, setSettingsMode] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* open from external event (family circle etc.) */
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("vaultshield-open-account", show);
    return () => window.removeEventListener("vaultshield-open-account", show);
  }, []);

  /* auth state */
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      if (!current || current.isAnonymous || !db) return;
      setName(current.displayName?.slice(0, 40) || "");
      try {
        const snap = await getDoc(
          doc(db, "users", current.uid, "settings", "profile"),
        );
        if (auth?.currentUser?.uid !== current.uid) return;
        if (snap.exists()) {
          const p = snap.data();
          setName(p.displayName);
          setLanguage(p.language);
          localStorage.setItem("vaultshield-family-name", p.displayName);
          window.dispatchEvent(new Event("vaultshield-profile"));
        }
      } catch {
        // non-fatal
      }
    });
  }, []);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSettingsMode(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (error instanceof ExistingAccount) {
        // This Google account was already signed in before (any device/
        // browser) - that's the normal, expected case for a returning user
        // clicking "sign in", not an edge case worth an extra confirmation
        // click. The current guest session has nothing destroyed either
        // way: it simply stays an orphaned anonymous user in Firestore.
        try {
          await openExistingAccount(error.credential);
          location.reload();
        } catch {
          setMessage(t("Could not complete this action. Please try again."));
        }
      } else {
        const code = (error as { code?: string }).code;
        setMessage(
          t(
            code === "auth/operation-not-allowed"
              ? "Enable Google sign-in in Firebase Authentication first."
              : "Could not complete this action. Please try again.",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const isSignedIn = user && !user.isAnonymous;
  const displayLabel = isSignedIn
    ? (name || user.email || "Account")
    : "Guest";
  const emailLabel = isSignedIn ? (user.email ?? "") : "";

  return (
    <div className="account-control" ref={panelRef}>
      {/* Avatar trigger */}
      <button
        type="button"
        className="avatar-btn"
        onClick={() => { setOpen((o) => !o); setSettingsMode(false); }}
        aria-expanded={open}
        aria-label={isSignedIn ? displayLabel : t("Sign in")}
        title={isSignedIn ? displayLabel : t("Sign in")}
      >
        {isSignedIn ? (
          user.photoURL ? (
            <img src={user.photoURL} className="avatar-photo" alt="" />
          ) : (
            <span
              className="avatar-initials"
              style={{ background: avatarColor(user.uid) }}
            >
              {initials(name || user.email || "U")}
            </span>
          )
        ) : (
          <span className="avatar-guest">
            <span className="avatar-guest-head" />
            <span className="avatar-guest-body" />
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="account-dropdown" role="dialog" aria-label={t("Account")}>
          {isSignedIn && !settingsMode && (
            <>
              {/* User identity block */}
              <div className="acct-identity">
                <span
                  className="acct-avatar-lg"
                  style={{ background: avatarColor(user.uid) }}
                >
                  {user.photoURL
                    ? <img src={user.photoURL} alt="" />
                    : initials(name || user.email || "U")}
                </span>
                <div className="acct-identity-text">
                  <div className="acct-name">{name || t("My account")}</div>
                  <div className="acct-email">{emailLabel}</div>
                </div>
              </div>
              <div className="acct-divider" />
              <button
                className="acct-menu-item"
                onClick={() => setSettingsMode(true)}
              >
                <Settings size={15} />
                {t("Edit name")}
              </button>
              <div className="acct-divider" />
              <button
                className="acct-menu-item acct-signout"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveAccount();
                    localStorage.removeItem("vaultshield-family-name");
                    location.reload();
                  })
                }
              >
                <LogOut size={15} />
                {t("Sign out")}
              </button>
            </>
          )}

          {isSignedIn && settingsMode && (
            <>
              <div className="acct-settings-header">
                <button
                  className="acct-back-btn"
                  onClick={() => setSettingsMode(false)}
                >
                  ← {t("Back")}
                </button>
                <span>{t("Edit name")}</span>
              </div>
              <div className="acct-divider" />
              <div className="acct-field">
                <label>{t("Your name")}</label>
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("Display name")}
                />
              </div>
              <button
                className="acct-save-btn"
                disabled={busy || name.trim().length < 2}
                onClick={() =>
                  void run(async () => {
                    if (!db || !auth?.currentUser) return;
                    await setDoc(
                      doc(db, "users", auth.currentUser.uid, "settings", "profile"),
                      { displayName: name.trim(), language },
                    );
                    localStorage.setItem("vaultshield-family-name", name.trim());
                    window.dispatchEvent(new Event("vaultshield-profile"));
                    setSettingsMode(false);
                    setOpen(false);
                  })
                }
              >
                {t("Save")}
              </button>
            </>
          )}

          {!isSignedIn && (
            <>
              <div className="acct-signin-header">
                <div className="acct-guest-icon"><UserRound size={28} /></div>
                <div className="acct-signin-title">{t("Save your account")}</div>
                <div className="acct-signin-sub">
                  {t("Sign in to sync your private diary and family circle across devices.")}
                </div>
              </div>
              <div className="acct-divider" />
              <button
                className="acct-google-btn"
                disabled={busy || !user}
                onClick={() =>
                  void run(async () => {
                    await continueWithGoogle();
                    const displayName =
                      localStorage.getItem("vaultshield-family-name") ||
                      auth?.currentUser?.displayName?.slice(0, 40) || "";
                    if (db && auth?.currentUser && displayName.trim().length >= 2) {
                      await setDoc(
                        doc(db, "users", auth.currentUser.uid, "settings", "profile"),
                        { displayName: displayName.trim(), language },
                      );
                    }
                    location.reload();
                  })
                }
              >
                <Chrome size={16} />
                {t("Continue with Google")}
              </button>
            </>
          )}

          {message && <p className="acct-message">{message}</p>}
        </div>
      )}
    </div>
  );
}
