import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  onAuthStateChanged,
  type User,
  type AuthCredential,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase/config";
import {
  continueWithGoogle,
  handleGoogleRedirect,
  ExistingAccount,
  openExistingAccount,
  leaveAccount,
} from "../lib/firebase/account";
import { t, setLanguage, useAppLanguage } from "../lib/i18n";
export default function Account() {
  const language = useAppLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<AuthCredential>();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("vaultshield-open-account", show);
    return () => window.removeEventListener("vaultshield-open-account", show);
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const linked = await handleGoogleRedirect();
        if (!linked) return;
        const displayName =
          localStorage.getItem("vaultshield-family-name") ||
          auth?.currentUser?.displayName?.slice(0, 40) ||
          "";
        if (db && auth?.currentUser && displayName.trim().length >= 2) {
          await setDoc(
            doc(db, "users", auth.currentUser.uid, "settings", "profile"),
            { displayName: displayName.trim(), language: "en" },
          );
        }
        location.reload();
      } catch (error) {
        if (error instanceof ExistingAccount) setExisting(error.credential);
        else {
          const code = (error as { code?: string }).code;
          setMessage(
            t(
              code === "auth/operation-not-allowed"
                ? "Enable Google sign-in in Firebase Authentication first."
                : "Could not complete this action. Please try again.",
            ),
          );
        }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      if (!current || current.isAnonymous || !db) return;
      setName(current.displayName?.slice(0, 40) || "");
      try {
        const snapshot = await getDoc(
          doc(db, "users", current.uid, "settings", "profile"),
        );
        if (auth?.currentUser?.uid !== current.uid) return;
        if (snapshot.exists()) {
          const profile = snapshot.data();
          setName(profile.displayName);
          setLanguage(profile.language);
          localStorage.setItem("vaultshield-family-name", profile.displayName);
          window.dispatchEvent(new Event("vaultshield-profile"));
        }
      } catch {
        setMessage(t("Could not load account settings. Please try again."));
      }
    });
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (error instanceof ExistingAccount) setExisting(error.credential);
      else {
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
  return (
    <div className="account-control">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {t(user && !user.isAnonymous ? "My account" : "Save my account")}
      </button>
      {open && (
        <section className="card account-panel" aria-label={t("My account")}>
          <button type="button" className="account-panel-close" aria-label={t("Close")} onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
          {user && !user.isAnonymous ? (
            <>
              <h2>{t("My account")}</h2>
              <p>{user.email}</p>
              <label htmlFor="account-name">
                {t("Your name in the family")}
              </label>
              <input
                id="account-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
              <p>{t("Your selected language is saved with your name.")}</p>
              <button
                disabled={busy || name.trim().length < 2}
                onClick={() =>
                  void run(async () => {
                    if (!db || !auth?.currentUser) return;
                    await setDoc(
                      doc(
                        db,
                        "users",
                        auth.currentUser.uid,
                        "settings",
                        "profile",
                      ),
                      { displayName: name.trim(), language },
                    );
                    localStorage.setItem(
                      "vaultshield-family-name",
                      name.trim(),
                    );
                    window.dispatchEvent(new Event("vaultshield-profile"));
                    setOpen(false);
                  })
                }
              >
                {t("Save settings")}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveAccount();
                    localStorage.removeItem("vaultshield-family-name");
                    location.reload();
                  })
                }
              >
                {t("Sign out")}
              </button>
            </>
          ) : (
            <>
              <h2>{t("Keep your family circle")}</h2>
              <p>
                {t(
                  "Continue with Google to keep this family circle and open it on your other devices.",
                )}
              </p>
              <button
                disabled={busy || !user}
                onClick={() =>
                  void run(async () => {
                    await continueWithGoogle();
                    const displayName =
                      localStorage.getItem("vaultshield-family-name") ||
                      auth?.currentUser?.displayName?.slice(0, 40) ||
                      "";
                    if (
                      db &&
                      auth?.currentUser &&
                      displayName.trim().length >= 2
                    ) {
                      await setDoc(
                        doc(
                          db,
                          "users",
                          auth.currentUser.uid,
                          "settings",
                          "profile",
                        ),
                        { displayName: displayName.trim(), language },
                      );
                    }
                    location.reload();
                  })
                }
              >
                {t("Continue with Google")}
              </button>
            </>
          )}
          {existing && (
            <div role="alert">
              <p>
                {t(
                  "This Google account already has a family circle. Open that account? Your guest connections stay separate.",
                )}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await openExistingAccount(existing);
                    location.reload();
                  })
                }
              >
                {t("Open existing account")}
              </button>
              <button disabled={busy} onClick={() => setExisting(undefined)}>
                {t("Cancel")}
              </button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      )}
    </div>
  );
}
