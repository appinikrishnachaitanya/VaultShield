import { stopLocalReading } from "./lib/localVoice";
import { t, useAppLanguage, setLanguage, tacticCount } from "./lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Cloud,
  Users,
  Check,
  Upload,
  MessageSquareText,
  ScanLine,
  X,
  WifiOff,
  Info,
  ChevronRight,
  Fingerprint,
  CircleCheck,
  Shield,
  FileText,
  Menu,
  BookHeart,
  IndianRupee,
  ShieldAlert,
  Film,
} from "lucide-react";
import { initializeServices } from "./lib/firebase/config";
import {
  checkAndroidReviewedText,
  checkWithLocalFallback,
  verifyWithCloud,
} from "./lib/firebase/ai";
import { androidAI, usesAndroidModel } from "./services/androidNano";
import {
  capabilityLabel,
  screenshotUnavailable,
  useAICapability,
  localAIDiagnostics,
} from "./services/aiCapability";
import { useLastAISource } from "./lib/aiSource";
import { maskIdentifiers, hasAssessableText } from "./lib/privacy";
import {
  sendAlert,
  watchFamily,
  enableNotifications,
} from "./lib/firebase/family";
import { useDialogFocus } from "./lib/useDialogFocus";
import { takeSharedInput } from "./lib/share";
import LocalTools from "./components/LocalTools";
import Account from "./components/Account";
import DocumentScanner from "./components/DocumentScanner";
import ExplainForFamily from "./components/ExplainForFamily";
import UPIVerify from "./components/UPIVerify";
import MediaVault from "./components/MediaVault";
import ScaredPanel from "./components/ScaredPanel";
import KnowYourRights from "./components/KnowYourRights";
import TokenVaultPreview from "./components/TokenVaultPreview";
import PrivacyStatsBar from "./components/PrivacyStatsBar";
import { recordCheck } from "./lib/privacyStats";
import FamilyCircle from "./components/FamilyCircle";
import Welcome from "./components/Welcome";
import { TokenVaultSession, rehydrate, countTokens } from "./lib/tokenVault";
import { routeInput, assertCloudRoute } from "./lib/router";
import RoutingBanner from "./components/RoutingBanner";
import { buildReceipt, type PrivacyReceiptData } from "./lib/receipt";
import PrivacyReceipt from "./components/PrivacyReceipt";
import LocalCheckNotice from "./components/LocalCheckNotice";
import { runLeakTest, assertNoKnownLeak } from "./lib/leakTest";
import ReviewDialog from "./components/ReviewDialog";
import { useReviewedText } from "./lib/useReviewedText";
import NetworkProof from "./components/NetworkProof";
import CommunitySignal from "./components/CommunitySignal";
import DemoStories from "./components/DemoStories";
import { patternSignal } from "./lib/patterns";
import { startNetworkCheck } from "./lib/netProof";
import type { TokenEntry } from "./lib/tokenVault";
import { AlreadyPaid, FamilySafety } from "./components/FamilySafety";
import LocalDictation from "./components/LocalDictation";
import PressureEvidence from "./components/PressureEvidence";
import CloudAssessment from "./components/CloudAssessment";
import type { LocalResult } from "./types/privacy";
const examples = [
  {
    title: "Digital arrest",
    label: "A message from “CBI”",
    text: "Name: Anjali Sharma\nCBI Officer speaking. Your Aadhaar 1234 5678 4521 is linked to money laundering. You will be arrested today. Send ₹50,000 to officer@upi within 10 minutes. Do not tell your family. Call 9876543210.",
  },
  {
    title: "Bank KYC",
    label: "An urgent bank SMS",
    text: "SBI ALERT: Your account will be blocked today. Update KYC within 10 minutes at https://sbi-kyc-check.example and share your OTP. Phone: 9876543210.",
  },
  {
    title: "Contract trap",
    label: "Before you sign",
    text: "Name: Arjun Mehta\nClient: Private Studio\nThe contractor transfers all intellectual property upon signing, including unpaid work. Client may withhold payment indefinitely and impose a penalty of ₹100,000 for discussing this contract with any advisor.",
  },
  {
    title: "Family emergency",
    label: "A familiar voice, unusual ask",
    text: "Papa main police station mein hoon. Please send ₹30,000 to helper@upi in 5 minutes or they will arrest me. Mummy ko mat batana. Please jaldi karo.",
  },
  {
    title: "A normal message",
    label: "Try the trust test",
    text: "Your parcel is out for delivery today. You can track its progress in the shopping app. No payment is required.",
  },
];
export default function App() {
  const vault = useRef(new TokenVaultSession());
  useEffect(() => {
    const clear = () => {
      vault.current.clear();
      setReceipt(undefined);
      setTokenSpans([]);
      setInput("");
      setImage(undefined);
      setResult(undefined);
      setCloud(undefined);
      setEdit("");
      setConsent(false);
      setReview(false);
    };
    vault.current.onExpire = clear;
    window.addEventListener("pagehide", clear);
    return () => {
      vault.current.onExpire = undefined;
      vault.current.clear();
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  const appLanguage = useAppLanguage();
  useEffect(() => {
    document.documentElement.lang = appLanguage;
  }, [appLanguage]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<"check" | "family" | "privacy" | "docs" | "diary" | "upi" | "media">(() =>
    new URLSearchParams(location.search).get("view") === "family"
      ? "family"
      : "check",
  );
  const [input, setInput] = useState("");
  const [image, setImage] = useState<{
    data: string;
    mimeType: string;
    name: string;
    url: string;
  }>();
  const [result, setResult] = useState<LocalResult>();
  const [receipt, setReceipt] = useState<PrivacyReceiptData>();
  const [tokenSpans, setTokenSpans] = useState<TokenEntry[]>([]);
  const privacyRoute = routeInput(
    input + "\n" + (result?.text || ""),
    Boolean(image && !result),
  );
  const localOnly = privacyRoute.tier === "LOCAL_ONLY";
  const [sensitiveOverride, setSensitiveOverride] = useState(false);
  const [coolOffUntil, setCoolOffUntil] = useState<number | null>(null);
  const [cloud, setCloud] =
    useState<Awaited<ReturnType<typeof verifyWithCloud>>>();
  const { edit, setEdit, consent, setConsent } = useReviewedText();
  const leakResult = runLeakTest(edit, vault.current);
  const [verificationPurpose, setVerificationPurpose] = useState<
    "hybrid" | "public-sources"
  >("hybrid");
  const [review, setReview] = useState(false);
  useEffect(() => {
    setSensitiveOverride(false);
    setConsent(false);
  }, [edit, verificationPurpose]);
  const [busy, setBusy] = useState("");
  const taskRunning = useRef(false);
  const [localProgress, setLocalProgress] = useState("");
  const capability = useAICapability();
  const lastAISource = useLastAISource();
  const [localDiagnostics, setLocalDiagnostics] =
    useState<Awaited<ReturnType<typeof localAIDiagnostics>>>();
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const messageEditor = useRef<HTMLTextAreaElement>(null);
  const [piiCount, setPiiCount] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting securely…");
  const [online, setOnline] = useState(navigator.onLine);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [alerts, setAlerts] = useState<
    { id: string; stages: number; senderName: string; time: number }[]
  >([]);
  const [diagnostics, setDiagnostics] = useState<{
    modelStatus: string;
    mlKitStatus?: number;
    lastError: string;
    lastErrorCode?: number;
    appCheck: string;
  }>();
  const versionTaps = useRef(0);
  const [notice, setNotice] = useState("");
  const [notificationsReady, setNotificationsReady] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let stop = () => {};
    initializeServices()
      .then(() => {
        if (active) {
          setStatus("Private session ready");
          stop = watchFamily(setMembers, setAlerts, (e) =>
            setError(
              `Family inbox / Firestore: ${e.message} Check that the app rules are published to the (default) database in vaultshield-2ace9. If App Check enforcement is enabled, verify this browser’s debug token is registered.`,
            ),
          );
          if (
            !usesAndroidModel &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            void enableNotifications()
              .then(() => {
                if (active) setNotificationsReady(true);
              })
              .catch(() => {
                // Keep the registration button available if token refresh needs attention.
              });
          }
        }
      })
      .catch((e) => {
        if (active) {
          setStatus("Private session could not connect");
          setError(`Firebase sign-in: ${e.message}`);
        }
      });
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      stop();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  async function task(label: string, fn: () => Promise<void>) {
    if (taskRunning.current) return;
    taskRunning.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      taskRunning.current = false;
      setBusy("");
    }
  }
  async function analyze() {
    await task("Checking on your device", async () => {
      setSensitiveOverride(false);
      startNetworkCheck();
      setResult(undefined);
      setCloud(undefined);
      setConsent(false);
      setLocalProgress("Preparing the on-device check...");
      vault.current.clear();
      const tokenized = vault.current.tokenize(input);
      const version = vault.current.version;
      const r = await checkWithLocalFallback(
        tokenized.text,
        image,
        setLocalProgress,
      );
      if (vault.current.version !== version) return;
      const modelTokens = vault.current.tokenize(r.text);
      r.text = modelTokens.text;
      const counts = countTokens(r.text);
      r.masked = Object.values(counts).reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      setTokenSpans(tokenized.entries);
      setReceipt(
        buildReceipt({
          route: routeInput(input + "\n" + r.text),
          source: r.source,
          elapsedMs: r.durationMs,
          counts,
        }),
      );
      setCoolOffUntil(
        r.source !== "LOCAL_RULES" &&
          r.stages.filter((stage) => stage.found).length >= 3
          ? Date.now() + 600_000
          : null,
      );
      setResult(r);
      setEdit(r.text);
      recordCheck(
        r.masked,
        new TextEncoder().encode(input).length,
        r.source === "LOCAL_RULES" ? 0 : new TextEncoder().encode(vault.current.tokenize(input).text).length,
      );
      if (
        usesAndroidModel &&
        r.source === "LOCAL_RULES" &&
        routeInput(input + "\n" + r.text).tier !== "LOCAL_ONLY"
      ) {
        setVerificationPurpose("hybrid");
        setReview(true);
        setNotice(
          "Android local AI could not run. Review the masked text to allow Firebase local-first verification with cloud fallback.",
        );
      }
      setTimeout(
        () =>
          output.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    });
  }
  function submitReviewedText() {
    void task("Verifying approved text", async () => {
      assertCloudRoute(privacyRoute, sensitiveOverride);
      assertNoKnownLeak(edit, vault.current);
      const version = vault.current.version;
      const sanitized = vault.current.tokenize(edit).text;
      if (sanitized !== edit) {
        setEdit(sanitized);
        setConsent(false);
        throw new Error(
          "Additional identifiers were removed. Review the updated text and give permission again.",
        );
      }
      if (
        usesAndroidModel &&
        result?.source === "LOCAL_RULES" &&
        verificationPurpose === "hybrid"
      ) {
        const hybridResult = await checkAndroidReviewedText(
          sanitized,
          consent,
          vault.current,
          sensitiveOverride,
        );
        if (version !== vault.current.version) return;
        setReceipt(
          buildReceipt({
            route: privacyRoute,
            source: hybridResult.source,
            purpose: "hybrid",
            model: hybridResult.cloudModel,
            elapsedMs: hybridResult.durationMs,
            counts: countTokens(sanitized),
            sensitiveOverride,
            payload: hybridResult.requestPayload,
            approvedText: sanitized,
          }),
        );
        setResult(hybridResult);
        setEdit(hybridResult.text);
        setCoolOffUntil(
          hybridResult.stages.filter((stage) => stage.found).length >= 3
            ? Date.now() + 600_000
            : null,
        );
        setConsent(false);
        setReview(false);
        return;
      }
      const verification = await verifyWithCloud(
        sanitized,
        consent,
        input,
        verificationPurpose,
        appLanguage,
        vault.current,
        sensitiveOverride,
      );
      if (version !== vault.current.version) return;
      setCloud(verification);
      setReceipt(
        buildReceipt({
          route: privacyRoute,
          source: verification.source,
          purpose: verification.purpose,
          model: verification.model,
          elapsedMs: verification.durationMs,
          counts: countTokens(sanitized),
          sensitiveOverride,
          payload: verification.requestPayload,
          approvedText: sanitized,
          groundingUsed: verification.groundingUsed,
        }),
      );
      setConsent(false);
      setReview(false);
    });
  }
  async function pasteMessage() {
    try {
      if (!navigator.clipboard?.readText)
        throw new Error("Clipboard access unavailable.");
      const value = await navigator.clipboard.readText();
      if (value.length > 16000) {
        setError(
          "The clipboard message exceeds 16,000 characters. Shorten it before pasting.",
        );
        return;
      }
      if (!value.trim()) {
        setError(
          "No text found on the clipboard. Copy the message, then try again.",
        );
        return;
      }
      reset();
      setInput(value);
      setImage(undefined);
      setError("");
    } catch {
      setError(
        "Couldn't read the clipboard. Touch and hold in the message field to paste manually.",
      );
      messageEditor.current?.focus();
    }
  }

  function reset() {
    setSensitiveOverride(false);
    startNetworkCheck();
    vault.current.clear();
    setReceipt(undefined);
    setTokenSpans([]);
    setCoolOffUntil(null);
    setResult(undefined);
    setCloud(undefined);
    setConsent(false);
    setReview(false);
  }
  async function upload(f?: File) {
    if (!f) return;
    setError("");
    if (
      !["image/png", "image/jpeg"].includes(f.type) ||
      f.size > 8 * 1024 * 1024
    ) {
      setError("Choose one JPEG or PNG image under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read this image.");
    reader.onload = () => {
      reset();
      setImage({
        data: String(reader.result).split(",")[1],
        mimeType: f.type,
        name: f.name,
        url: URL.createObjectURL(f),
      });
    };
    reader.readAsDataURL(f);
  }
  const closeReview = useCallback(() => {
    if (!busy) {
      setReview(false);
      setSensitiveOverride(false);
    }
  }, [busy]);
  const dialogRef = useDialogFocus(review, closeReview);
  useEffect(() => {
    if (!usesAndroidModel) {
      void takeSharedInput()
        .then((shared) => {
          if (shared) {
            setInput(shared.text.slice(0, 16000));
            if (shared.file) void upload(shared.file);
          }
        })
        .catch(() =>
          setError("Could not read the shared item. Paste it manually."),
        );
      return;
    }
    let active = true;
    const consume = async () => {
      try {
        const shared = await androidAI.getSharedData();
        if (!active) return;
        if (shared.status)
          throw new Error("Shared item is unsupported or could not be read.");
        if (shared.text === undefined && !shared.image) return;
        setTab("check");
        reset();
        setError("");
        setImage(undefined);
        setInput(shared.text ?? "");
        if (shared.image && shared.mimeType) {
          const bytes = Uint8Array.from(atob(shared.image), (c) =>
            c.charCodeAt(0),
          );
          await upload(
            new File([bytes], "Shared screenshot", { type: shared.mimeType }),
          );
        }
      } catch {
        if (active)
          setError(
            "Couldn't open that share. Paste text or select a JPEG or PNG under 8 MB.",
          );
      }
    };
    const listener = androidAI.addListener(
      "shareReceived",
      () => void consume(),
    );
    void listener
      .then(() => {
        if (active) void consume();
      })
      .catch(() => {
        if (active)
          setError(
            "Android share intake is unavailable. Paste text or select an image.",
          );
      });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!usesAndroidModel) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void import("./services/androidNotifications")
      .then(({ watchAndroidPush }) =>
        watchAndroidPush(
          () => {
            if (active) setTab("family");
          },
          () => {
            if (active) setTab("family");
          },
        ),
      )
      .then((stop) => {
        if (active) cleanup = stop;
        else stop();
      })
      .catch(() => {});
    return () => {
      active = false;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "VAULTSHIELD_FAMILY_ALERT") setTab("family");
      if (event.data?.type === "VAULTSHIELD_OPEN_FAMILY") setTab("family");
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () =>
      navigator.serviceWorker.removeEventListener("message", receive);
  }, []);
  const count = result?.stages.filter((s) => s.found).length ?? 0;
  const awaitingAndroidHybrid =
    usesAndroidModel && result?.source === "LOCAL_RULES" && !localOnly;
  const navItems = [
    { id: "check", icon: ScanLine, label: t("Check something") },
    { id: "docs", icon: FileText, label: t("Document Vault") },
    { id: "media", icon: Film, label: t("Media Vault") },
    { id: "family", icon: Users, label: t("Family circle") },
  ] as const;
  return (
    <div className="app">
      <Welcome />
      {/* Mobile drawer overlay */}
      <div
        className={`drawer-overlay${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      {/* Mobile slide-out drawer */}
      <div className={`drawer${drawerOpen ? " open" : ""}`} role="navigation" aria-label={t("Main menu")}>
        <div className="drawer-header">
          <a className="brand" href="/" aria-label="VaultShield home">
            <span className="brand-icon"><ShieldCheck size={25} /></span>
            VaultShield
          </a>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t("Close menu")}>
            <X size={20} />
          </button>
        </div>
        <nav className="drawer-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => { setTab(item.id); setDrawerOpen(false); }}
            >
              <item.icon size={21} />
              {t(item.label)}
              {item.id === "family" && alerts.length > 0 && (
                <span className="nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="drawer-bottom">
          <div className="session">
            <span className="dot" />
            {online ? t("Private by design") : t("You are offline")}
          </div>
          <button
            className={
`nav-privacy-link${tab === "privacy" ? " active" : ""}`}
            onClick={() => { setTab("privacy"); setDrawerOpen(false); }}
          >
            <LockKeyhole size={13} />
            {t("Privacy & Data")}
          </button>
        </div>
      </div>
      <aside className="sidebar" inert={review}>
        <a className="brand" href="/" aria-label="VaultShield home">
          <span className="brand-icon">
            <ShieldCheck size={25} />
          </span>
          VaultShield
        </a>
        <div className="workspace-label">
          {t("YOUR PEACE OF MIND, PROTECTED")}
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={21} />
              {t(item.label)}
              {item.id === "family" && alerts.length > 0 && (
                <span className="nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <PrivacyStatsBar />
        <div className="sidebar-bottom">
          <div className="mini-shield">
            <Fingerprint size={26} />
          </div>
          <strong>
            {t(" A little pause. ")}
            <br />
            {t("A lot of protection. ")}
          </strong>
          <p>
            {t(
              " Your personal information belongs to you. Let’s keep it that way. ",
            )}
          </p>
          <div className="session">
            <span className="dot" />
            {online ? t("Private by design") : t("You are offline")}
          </div>
          <button
            className={
`nav-privacy-link${tab === "privacy" ? " active" : ""}`}
            onClick={() => setTab("privacy")}
          >
            <LockKeyhole size={13} />
            {t("Privacy & Data")}
          </button>
        </div>
        {/* Mobile: hamburger button shown via CSS */}
        <button
          className="menu-toggle"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("Open menu")}
          aria-expanded={drawerOpen}
        >
          <Menu size={22} />
        </button>
      </aside>
      <div className="main-shell" inert={review}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-hamburger"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("Open menu")}
            >
              <Menu size={20} />
            </button>
            <span className="topbar-page-title">
              {tab === "check" && t("Safety Check")}
              {tab === "docs" && t("Document Vault")}
              {tab === "media" && t("Media Vault")}
              {tab === "family" && t("Family Circle")}
              {tab === "privacy" && t("Privacy & Data")}
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`topbar-ai-pill${!online ? " offline" : lastAISource === "IN_CLOUD" ? " cloud" : ""}`}
              role="status"
              title={lastAISource === "ON_DEVICE" ? "Last inference: on-device (private)" : lastAISource === "IN_CLOUD" ? "Last inference: cloud (tokenized text only)" : ""}
            >
              <span className="topbar-ai-dot" />
              {!online
                ? t("Offline")
                : lastAISource === "ON_DEVICE"
                  ? t("On-device AI")
                  : lastAISource === "IN_CLOUD"
                    ? t("Cloud AI")
                    : capabilityLabel(capability).toLowerCase().includes("on-device")
                      ? t("On-device AI")
                      : t("AI Ready")}
            </span>
            <select
              className="topbar-lang"
              aria-label="English / हिन्दी"
              value={appLanguage}
              onChange={(event) => {
                setLanguage(event.target.value as "en" | "hi");
                stopLocalReading();
              }}
            >
              <option value="en" lang="en">EN</option>
              <option value="hi" lang="hi">हि</option>
            </select>
            <Account />
          </div>
        </header>
        <main>
          {!online && (
            <div className="offline-mode-banner" role="status">
              <WifiOff size={18} />
              <div>
                <strong>{t("Works offline")}</strong>
                <span>{t(" — on-device AI active. No internet needed.")}</span>
              </div>
            </div>
          )}
          <section
            className="privacy-router-intro"
            aria-label={t("Privacy Router for AI")}
          >
            <strong>{t("Privacy Router for AI")}</strong>
            <p>
              {t(
                "Cloud reasons over placeholders. This device holds the values. A receipt shows what the app submitted.",
              )}
            </p>
          </section>
          {(input.trim() || image) && <RoutingBanner route={privacyRoute} />}
          <p className="language-note">
            {t(
              "Source messages and quoted evidence stay in their original language. New AI explanations use your selected language.",
            )}
          </p>
          <div className="connection-status" role="status">
            {t(status)}
          </div>
          {error && (
            <div role="alert" className="banner error">
              <Info size={20} />
              <span>{t(error)}</span>
              <button
                aria-label={t("Dismiss error")}
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              <CircleCheck size={20} />
              {t(notice)}
            </div>
          )}
          {tab === "check" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">
                  <span className="tiny-line" />
                  {t(" A SECOND OPINION, BEFORE YOU ACT ")}
                </span>
                <h1>
                  {t(" Something feel ")}
                  <span>{t("off?")}</span>
                  <br />
                  {t(" Let’s check it together. ")}
                </h1>
                <p>{t("Check it before you pay for it. Privately.")}</p>
              </div>
              <div className="workspace">
                <section className="check-column">
                  <div className="card input-card">
                    <div className="card-title">
                      <div className="icon-tile">
                        <MessageSquareText size={23} />
                      </div>
                      <div>
                        <h2>{t("What would you like to check?")}</h2>
                        <p>
                          {t("A message, payment request, or contract clause.")}
                        </p>
                      </div>
                    </div>
                    <LocalDictation
                      disabled={!!busy}
                      onUse={(text) => {
                        const combined = [input.trim(), text.trim()]
                          .filter(Boolean)
                          .join("\n");
                        if (combined.length > 16000) {
                          setError(
                            "The combined message exceeds 16,000 characters. Shorten it before adding the transcript.",
                          );
                          return;
                        }
                        setInput(combined);
                        reset();
                      }}
                    />
                    <DemoStories
                      onChoose={(text) => {
                        reset();
                        setImage(undefined);
                        setInput(text);
                      }}
                    />
                    <label htmlFor="message" className="input-label">
                      {t(" Paste your message ")}
                    </label>
                    <button
                      type="button"
                      className="secondary paste-message"
                      disabled={!!busy}
                      onClick={() => void pasteMessage()}
                    >
                      {t(" Paste Message ")}
                    </button>
                    <textarea
                      ref={messageEditor}
                      id="message"
                      value={input}
                      maxLength={16000}
                      disabled={!!busy}
                      onChange={(e) => {
                        setInput(e.target.value);
                        reset();
                      }}
                      placeholder={t(
                        "“Your account will be blocked. Update your KYC immediately…”",
                      )}
                    />
                    <div className="editor-footer">
                      <span>{t("English, हिंदी & Hinglish welcome")}</span>
                      <span>{input.length.toLocaleString()}/16,000</span>
                    </div>
                    <TokenVaultPreview input={input} onCountChange={setPiiCount} />
                    <div className="divider">
                      <span>{t("or add a screenshot")}</span>
                    </div>
                    <input
                      ref={file}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      disabled={!!busy}
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    {image ? (
                      <div className="image-preview">
                        <img
                          src={image.url}
                          alt={t("Selected screenshot, kept on this device")}
                        />
                        <span>{image.name}</span>
                        <button
                          aria-label={t("Remove image")}
                          disabled={!!busy}
                          onClick={() => {
                            setImage(undefined);
                            reset();
                          }}
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled={!!busy}
                        className="upload-zone"
                        onClick={() => file.current?.click()}
                      >
                        <Upload size={22} />
                        <span>
                          <strong>{t("Upload a screenshot")}</strong>
                          <small>{t("WhatsApp, SMS, any app · JPG or PNG")}</small>
                        </span>
                        <span className="upload-plus">+</span>
                      </button>
                    )}
                    <button
                      className={`primary check-button${piiCount > 0 && !busy ? " has-pii" : ""}`}
                      disabled={!!busy || (!input.trim() && !image)}
                      onClick={() => void analyze()}
                    >
                      <ShieldCheck size={21} />
                      {busy === "Checking on your device"
                        ? t("Checking on your device…")
                        : piiCount > 0
                          ? t(`Check privately — ${piiCount} identifier${piiCount !== 1 ? "s" : ""} masked`)
                          : t("Check privately")}
                      {!busy && <span className="button-key">↵</span>}
                    </button>
                    {busy === "Checking on your device" && (
                      <p className="local-progress" role="status">
                        {localProgress}
                      </p>
                    )}
                    {image && error && (
                      <p className="local-progress">
                        {t(screenshotUnavailable)}
                      </p>
                    )}
                    <div className="private-note">
                      <LockKeyhole size={14} />
                      {t(
                        " Your message stays on this device. Cloud is always your choice. ",
                      )}
                    </div>
                  </div>
                  <div className="examples">
                    <div className="section-label">
                      {t(" NOT SURE? TRY AN EXAMPLE ")}
                      <span>{t("Sample messages")}</span>
                    </div>
                    <div className="example-grid">
                      {examples.map((e, i) => (
                        <button
                          key={t(e.title)}
                          disabled={!!busy}
                          onClick={() => {
                            setInput(e.text);
                            setImage(undefined);
                            reset();
                          }}
                        >
                          <span className={`example-icon e${i}`}>
                            {i === 2 ? (
                              <FileText size={18} />
                            ) : i === 4 ? (
                              <CircleCheck size={18} />
                            ) : (
                              <MessageSquareText size={18} />
                            )}
                          </span>
                          <span>
                            <strong>{t(e.title)}</strong>
                            <small>{t(e.label)}</small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <aside className="inspector">
                  <div className="card privacy-card">
                    <div className="inspector-heading">
                      <div className="icon-tile">
                        <Fingerprint size={22} />
                      </div>
                      <span>{t("YOUR PRIVACY FIREWALL")}</span>
                      <LockKeyhole size={17} />
                    </div>
                    <h2>
                      {t(" Private first. ")}
                      <br />
                      {t(" Helpful second. ")}
                    </h2>
                    <p>
                      {t(
                        " Personal details are removed on your device before you choose to verify online. ",
                      )}
                    </p>
                    <div className="redaction-demo">
                      <div>
                        <span>{t("Personal name")}</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div>
                        <span>{t("Aadhaar number")}</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div>
                        <span>{t("UPI / phone")}</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div className="demo-caption">
                        <ShieldCheck size={14} />
                        {result
                          ? `${result.masked} ${t("redaction markers · review for missed details")}`
                          : t(
                              "Illustration · your actual preview appears after checking",
                            )}
                      </div>
                    </div>
                    <div className="flow-step">
                      <span className="step-number">1</span>
                      <div>
                        <strong>{t("Check on your device")}</strong>
                        <small>
                          {t(" Find pressure tactics & mask private details. ")}
                        </small>
                      </div>
                      <span className="local-tag">{t("LOCAL")}</span>
                    </div>
                    <div className="step-connector" />
                    <div className="flow-step">
                      <span className="step-number optional">2</span>
                      <div>
                        <strong>
                          {t(" Review & verify ")}
                          <em>{t("Optional")}</em>
                        </strong>
                        <small>
                          {t(" Only the redacted text. Only with permission. ")}
                        </small>
                      </div>
                    </div>
                    <div className="privacy-bottom">
                      <Check size={16} />
                      {t(" No message history stored ")}
                    </div>
                  </div>
                  <div className="gentle-note">
                    <span className="note-icon">
                      <Shield size={20} />
                    </span>
                    <div>
                      <strong>{t("Pressure is a reason to pause.")}</strong>
                      <p>
                        {t(
                          " Before sending money or sharing a code, contact someone you trust through a number you already know. ",
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="service-status">
                    <span className="dot" />
                    {t(status)}
                  </div>
                </aside>
              </div>
              {result && (
                <div ref={output} className="results">
                  <div className="result-heading">
                    <div>
                      <span
                        className={`badge ${result.source === "IN_CLOUD" ? "cloud" : "local"}`}
                      >
                        <ShieldCheck size={14} />
                        {awaitingAndroidHybrid
                          ? t("HYBRID AI · REVIEW REQUIRED")
                          : result.source === "IN_CLOUD"
                            ? t("HYBRID · CLOUD FALLBACK")
                            : result.source === "LOCAL_RULES"
                              ? t("LOCAL RULES · NOT AI")
                              : usesAndroidModel
                                ? t("NATIVE ON-DEVICE AI")
                                : t("ON-DEVICE AI")}
                        {result.ruleAssisted ? t(" + LOCAL RULES") : ""} ·{" "}
                        {(result.durationMs / 1000).toFixed(2)}s
                      </span>
                      <h2>
                        {awaitingAndroidHybrid
                          ? t("Review redacted text to run hybrid AI")
                          : !hasAssessableText(result.text)
                            ? t("No readable message to assess")
                            : count === 0
                              ? result.source === "LOCAL_RULES"
                                ? t("No common pressure phrases matched")
                                : result.ruleAssisted
                                  ? t("AI assessment incomplete")
                                  : t("No pressure tactics found")
                              : tacticCount(count)}
                      </h2>
                      <p>
                        {awaitingAndroidHybrid
                          ? t(
                              "The Android local model did not run. No pressure tactics have been assessed yet. Review the redacted text and approve Firebase AI Logic to prefer on-device inference with cloud fallback.",
                            )
                          : !hasAssessableText(result.text)
                            ? t(
                                "The image may have no readable message, or masking removed all usable text. This is not a safety assessment. Upload a clearer screenshot or paste the message.",
                              )
                            : result.source === "LOCAL_RULES"
                              ? t(
                                  "This basic check matches common phrases and masks recognizable identifiers. Review for missed pressure signals and private details.",
                                )
                              : count === 0
                                ? t(
                                    "This is not a guarantee of safety. Verify payment requests independently.",
                                  )
                                : t(
                                    "Pause before you pay. Here’s how this message is applying pressure.",
                                  )}
                      </p>
                      <p className="tool-hint">
                        {t(
                          " This count measures pressure tactics, not fraud probability. Zero tactics does not mean the request is genuine. ",
                        )}
                      </p>
                    </div>
                    {!awaitingAndroidHybrid && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void task("Sending alert", async () => {
                            const r = await sendAlert(count);
                            setNotice(
                              `Help requested in ${r.inboxes} family inbox(es). ${r.pushNotifications} push notification(s) accepted by FCM.`,
                            );
                          })
                        }
                      >
                        <Users size={18} />
                        {t(" Alert family ")}
                      </button>
                    )}
                  </div>
                  {awaitingAndroidHybrid && (
                    <div className="tool-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={
                          !!busy ||
                          (localOnly && !privacyRoute.overrideAllowed) ||
                          !hasAssessableText(result.text)
                        }
                        onClick={() => {
                          setConsent(false);
                          setVerificationPurpose("hybrid");
                          setReview(true);
                        }}
                      >
                        {t("Review & verify")}
                      </button>
                    </div>
                  )}
                  <LocalCheckNotice
                    result={result}
                    diagnostics={localDiagnostics}
                    checking={diagnosticsBusy}
                    disabled={!!busy}
                    onCheck={async () => {
                      setDiagnosticsBusy(true);
                      try {
                        setLocalDiagnostics(await localAIDiagnostics());
                      } finally {
                        setDiagnosticsBusy(false);
                      }
                    }}
                  />
                  {hasAssessableText(result.text) && !awaitingAndroidHybrid && (
                    <>
                      <PressureEvidence result={result} />
                      {result.ruleAssisted && (
                        <p className="tool-hint">
                          {t(
                            " Local AI returned a partial assessment. Its findings are preserved. Missing categories were checked separately with local phrase rules; a missing AI assessment does not mean no pressure. ",
                          )}
                        </p>
                      )}
                      {result.preparationMs !== undefined &&
                        result.generationMs !== undefined && (
                          <p className="tool-hint">
                            {t(" Preparation:")}{" "}
                            {(result.preparationMs / 1000).toFixed(1)}
                            {t("s · Analysis: ")}
                            {(result.generationMs / 1000).toFixed(1)}
                            {t(" s. Measured on this device. ")}
                          </p>
                        )}
                      <FamilySafety
                        cloudAllowed={!localOnly}
                        key={`family-safety:${result.text}`}
                        result={result}
                        coolOffUntil={coolOffUntil}
                      />
                      <div className="stage-grid">
                        {result.stages.map((s) => (
                          <div
                            key={s.name}
                            className={`stage ${s.found ? "found" : ""}`}
                          >
                            <div className="stage-title">
                              <span>
                                {s.found
                                  ? "!"
                                  : s.assessedByAI === false
                                    ? "?"
                                    : "✓"}
                              </span>
                              <h3>{t(s.name)}</h3>
                              <small>
                                {s.found
                                  ? t("Detected")
                                  : s.assessedByAI === false
                                    ? t("No phrase match")
                                    : t("Not detected")}
                              </small>
                            </div>
                            <p className="tool-hint">
                              {s.assessmentSource === "LOCAL_RULES"
                                ? result.source === "ON_DEVICE"
                                  ? t("Not assessed by AI · LOCAL RULES")
                                  : t("LOCAL RULES · NOT AI")
                                : s.assessmentSource === "IN_CLOUD"
                                  ? t("CLOUD AI · APPROVED TEXT")
                                  : t("ON-DEVICE AI")}
                            </p>
                            {s.found && (
                              <>
                                <blockquote>“{s.evidence}”</blockquote>
                                <p>{t(s.action)}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      {!!result.imageMismatches?.length && (
                        <section className="card family-safety">
                          <h3>{t("Possible screenshot mismatches")}</h3>
                          <p>
                            {t(
                              " These are observations from the image. Verify them independently. ",
                            )}
                          </p>
                          <ul>
                            {result.imageMismatches.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      )}
                      <details className="local-tools-drawer">
                        <summary>{t("Polish your reply · Optional")}</summary>
                        <LocalTools
                          key={`local-tools:${result.text}`}
                          text={result.text}
                        />
                      </details>
                    </>
                  )}
                  {!awaitingAndroidHybrid && result && (
                    <ExplainForFamily result={result} disabled={!!busy} />
                  )}
                  {!awaitingAndroidHybrid && (
                    <div className="card cloud-invite">
                      <Cloud size={28} />
                      <div>
                        <h3>{t("Want a second layer of verification?")}</h3>
                        <p>
                          {t(
                            " Automated masking can miss details. Please check the redacted text carefully before approving. Choose a hybrid second opinion or a cloud check of public sources.",
                          )}{" "}
                          {!hasAssessableText(result.text) &&
                            t(
                              "Verification is unavailable because no readable message remains. Your image has not been uploaded.",
                            )}
                        </p>
                      </div>
                      <button
                        className="primary"
                        disabled={
                          !!busy ||
                          (localOnly && !privacyRoute.overrideAllowed) ||
                          !hasAssessableText(result.text)
                        }
                        onClick={() => {
                          setReview(true);
                          setConsent(false);
                        }}
                      >
                        {t(" Review & verify ")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <AlreadyPaid key={result?.text ?? "no-report"} result={result} />
              {cloud && (
                <CloudAssessment
                  key={cloud.text}
                  cloud={cloud}
                  localDisplay={(text) => rehydrate(text, vault.current)}
                />
              )}
              {receipt && (
                <PrivacyReceipt
                  receipt={receipt}
                  original={input}
                  entries={tokenSpans}
                />
              )}
              {result && !localOnly && (
                <CommunitySignal
                  key={result.text}
                  signal={patternSignal(
                    result.stages,
                    vault.current.entries(),
                    appLanguage,
                  )}
                />
              )}
              <div className="page-footer">
                <LockKeyhole size={14} />
                <span>
                  {t("Your instincts matter. We help you check the facts.")}
                </span>
                <span className="footer-right">
                  {t(" Built for a safer everyday. ")}
                </span>
              </div>
            </>
          )}
          {tab === "family" && (
            <FamilyCircle
              members={members}
              alerts={alerts}
              busy={busy}
              task={task}
              setNotice={setNotice}
              notificationsReady={notificationsReady}
              setNotificationsReady={setNotificationsReady}
            />
          )}
          <div style={{ display: tab === "docs" ? "block" : "none" }}>
            <DocumentScanner />
          </div>
          <div style={{ display: tab === "media" ? "block" : "none" }}>
            <MediaVault />
          </div>
          {tab === "privacy" && (
            <div className="privacy-page">
              <div className="page-heading">
                <span className="eyebrow">{t("YOU ARE IN CONTROL")}</span>
                <h1>
                  {t(" Your data. ")}
                  <span>{t("Your decision.")}</span>
                </h1>
                <p>{t("Here’s exactly what stays and what leaves.")}</p>
              </div>
              <div className="privacy-section-grid">
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <LockKeyhole size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>{t("On this device")}</h2>
                    <p>
                      {t(
                        " Your original text and screenshots stay in the app’s memory during the private check. VaultShield does not save these messages in Firestore or browser storage. ",
                      )}
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Cloud size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>{t("Only after your permission")}</h2>
                    <p>
                      {t(
                        " You review and approve the exact redacted text before verification can use cloud AI or Google Search. Check for private details the redaction may have missed. ",
                      )}
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Users size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>{t("When you alert family")}</h2>
                    <p>
                      {t(
                        " VaultShield uses your anonymous account ID to send a help request with the pressure count and time. The alert contains no original message, screenshot, or location. ",
                      )}
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Info size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>{t("What your device supports")}</h2>
                    <p>
                      {t(
                        " On-device AI needs a compatible desktop Chrome setup or Android with AICore. When the model is unavailable, basic checks can still run on pasted text. Verify payment requests independently. ",
                      )}
                    </p>
                  </div>
                </section>
              </div>
              <div className="privacy-footer">
                <button
                  type="button"
                  className="secondary privacy-version"
                  onClick={() => {
                    if (++versionTaps.current % 5 !== 0) return;
                    setDiagnostics({
                      modelStatus: capability.modelStatus,
                      lastError: "",
                      appCheck: usesAndroidModel
                        ? "Checking…"
                        : "See Firebase connection status",
                    });
                    if (usesAndroidModel)
                      void androidAI
                        .diagnostics()
                        .then(setDiagnostics)
                        .catch(() =>
                          setDiagnostics({
                            modelStatus: capability.modelStatus,
                            lastError: "Diagnostic request failed",
                            appCheck: "Unknown",
                          }),
                        );
                  }}
                >
                  VaultShield v1.0.0
                </button>
              </div>
              {diagnostics && (
                <section
                  className="card privacy-diagnostics"
                  aria-labelledby="privacy-diagnostics-title"
                >
                  <h2 id="privacy-diagnostics-title">{t("Diagnostics")}</h2>
                  <dl>
                    <dt>{t("Platform")}</dt>
                    <dd>{capability.platform}</dd>
                    <dt>{t("Text engine")}</dt>
                    <dd>{capability.textEngine}</dd>
                    <dt>{t("Screenshot engine")}</dt>
                    <dd>{capability.screenshotEngine}</dd>
                    <dt>{t("Local model")}</dt>
                    <dd>{diagnostics.modelStatus}</dd>
                    <dt>{t("ML Kit status")}</dt>
                    <dd>{diagnostics.mlKitStatus ?? "—"}</dd>
                    <dt>{t("Last error")}</dt>
                    <dd>
                      {diagnostics.lastError || t("None reported")}{" "}
                      {diagnostics.lastErrorCode ?? ""}
                    </dd>
                    <dt>App Check</dt>
                    <dd>{diagnostics.appCheck}</dd>
                  </dl>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      {review && result && (
        <ReviewDialog
          dialogRef={dialogRef}
          text={edit}
          onEdit={(text) => {
            vault.current.touch();
            setEdit(text);
            setConsent(false);
          }}
          route={privacyRoute}
          leak={leakResult}
          busy={!!busy}
          error={error}
          purpose={verificationPurpose}
          onPurpose={(purpose) => {
            setVerificationPurpose(purpose);
            setConsent(false);
          }}
          sensitiveOverride={sensitiveOverride}
          onOverride={(value) => {
            setSensitiveOverride(value);
            setConsent(false);
          }}
          consent={consent}
          onConsent={setConsent}
          onSubmit={submitReviewedText}
          onClose={closeReview}
        />
      )}
    </div>
  );
}



