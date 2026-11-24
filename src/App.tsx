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
  Copy,
  Bell,
  Trash2,
  CircleCheck,
  Shield,
  FileText,
} from "lucide-react";
import { initializeServices } from "./lib/firebase/config";
import { checkWithLocalFallback, verifyWithCloud } from "./lib/firebase/ai";
import { androidAI, usesAndroidModel } from "./services/androidNano";
import {
  capabilityLabel,
  screenshotUnavailable,
  useAICapability,
  localAIDiagnostics,
} from "./services/aiCapability";
import { maskIdentifiers, hasAssessableText } from "./lib/privacy";
import {
  createInvite,
  joinFamily,
  sendAlert,
  watchFamily,
  enableNotifications,
  removeMember,
} from "./lib/firebase/family";
import { useDialogFocus } from "./lib/useDialogFocus";
import { takeSharedInput } from "./lib/share";
import LocalTools from "./components/LocalTools";
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
  const [tab, setTab] = useState<"check" | "family" | "privacy">(() =>
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
  const [coolOffUntil, setCoolOffUntil] = useState<number | null>(null);
  const [cloud, setCloud] =
    useState<Awaited<ReturnType<typeof verifyWithCloud>>>();
  const [edit, setEdit] = useState("");
  const [consent, setConsent] = useState(false);
  const [verificationPurpose, setVerificationPurpose] = useState<
    "hybrid" | "public-sources"
  >("hybrid");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState("");
  const taskRunning = useRef(false);
  const [localProgress, setLocalProgress] = useState("");
  const capability = useAICapability();
  const [localDiagnostics, setLocalDiagnostics] =
    useState<Awaited<ReturnType<typeof localAIDiagnostics>>>();
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const messageEditor = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting securely…");
  const [online, setOnline] = useState(navigator.onLine);
  const [members, setMembers] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; stages: number }[]>([]);
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [diagnostics, setDiagnostics] = useState<{
    modelStatus: string;
    mlKitStatus?: number;
    lastError: string;
    lastErrorCode?: number;
    appCheck: string;
  }>();
  const versionTaps = useRef(0);
  const [notice, setNotice] = useState("");
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
      setResult(undefined);
      setCloud(undefined);
      setConsent(false);
      setLocalProgress("Preparing the on-device check...");
      const r = await checkWithLocalFallback(input, image, setLocalProgress);
      setCoolOffUntil(
        r.stages.filter((stage) => stage.found).length >= 3
          ? Date.now() + 600_000
          : null,
      );
      setResult(r);
      setEdit(r.text);
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
      const sanitized = maskIdentifiers(edit).text;
      if (sanitized !== edit) {
        setEdit(sanitized);
        setConsent(false);
        throw new Error(
          "Additional identifiers were removed. Review the updated text and give permission again.",
        );
      }
      setCloud(
        await verifyWithCloud(sanitized, consent, input, verificationPurpose),
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
    if (!busy) setReview(false);
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
    if (!("serviceWorker" in navigator)) return;
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "VAULTSHIELD_FAMILY_ALERT")
        setNotice(
          "A family member requested help. Open Family circle and call them on their saved number.",
        );
      if (event.data?.type === "VAULTSHIELD_OPEN_FAMILY") setTab("family");
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () =>
      navigator.serviceWorker.removeEventListener("message", receive);
  }, []);
  const count = result?.stages.filter((s) => s.found).length ?? 0;
  return (
    <div className="app">
      <aside className="sidebar" inert={review}>
        <a className="brand" href="/" aria-label="VaultShield home">
          <span className="brand-icon">
            <ShieldCheck size={25} />
          </span>
          VaultShield
        </a>
        <div className="workspace-label">YOUR PEACE OF MIND, PROTECTED</div>
        <nav>
          {(
            [
              { id: "check", icon: ScanLine, label: "Check something" },
              { id: "family", icon: Users, label: "Family circle" },
              { id: "privacy", icon: LockKeyhole, label: "Your privacy" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={21} />
              {item.label}
              {item.id === "family" && alerts.length > 0 && (
                <span className="nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-shield">
            <Fingerprint size={26} />
          </div>
          <strong>
            A little pause.
            <br />A lot of protection.
          </strong>
          <p>
            Your personal information belongs to you. Let’s keep it that way.
          </p>
          <div className="session">
            <span className="dot" />
            {online ? "Private by design" : "You are offline"}
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={review}>
        <header className="topbar">
          <span className="breadcrumb">Your safety workspace</span>
          <span className="top-status ai-capability" role="status">
            {capabilityLabel(capability)}
          </span>
          <span className="top-status">
            {online ? <LockKeyhole size={14} /> : <WifiOff size={14} />}{" "}
            {online ? "No account needed" : "Offline mode"}
          </span>
          <button
            className="avatar"
            aria-label="Open family circle"
            onClick={() => setTab("family")}
          >
            VS
          </button>
        </header>
        <main>
          <div className="connection-status" role="status">
            {status}
          </div>
          {error && (
            <div role="alert" className="banner error">
              <Info size={20} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              <CircleCheck size={20} />
              {notice}
            </div>
          )}
          {tab === "check" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">
                  <span className="tiny-line" /> A SECOND OPINION, BEFORE YOU
                  ACT
                </span>
                <h1>
                  Something feel <span>off?</span>
                  <br />
                  Let’s check it together.
                </h1>
                <p>Check it before you pay for it. Privately.</p>
              </div>
              <div className="workspace">
                <section className="check-column">
                  <div className="card input-card">
                    <div className="card-title">
                      <div className="icon-tile">
                        <MessageSquareText size={23} />
                      </div>
                      <div>
                        <h2>What would you like to check?</h2>
                        <p>A message, payment request, or contract clause.</p>
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
                    <label htmlFor="message" className="input-label">
                      Paste your message
                    </label>
                    <button
                      type="button"
                      className="secondary paste-message"
                      disabled={!!busy}
                      onClick={() => void pasteMessage()}
                    >
                      Paste Message
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
                      placeholder={
                        "“Your account will be blocked. Update your KYC immediately…”"
                      }
                    />
                    <div className="editor-footer">
                      <span>English, हिंदी & Hinglish welcome</span>
                      <span>{input.length.toLocaleString()}/16,000</span>
                    </div>
                    <div className="divider">
                      <span>or add a screenshot</span>
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
                          alt="Selected screenshot, kept on this device"
                        />
                        <span>{image.name}</span>
                        <button
                          aria-label="Remove image"
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
                          <strong>Upload a screenshot</strong>
                          <small>One JPG or PNG · up to 8 MB</small>
                        </span>
                        <span className="upload-plus">+</span>
                      </button>
                    )}
                    <button
                      className="primary check-button"
                      disabled={!!busy || (!input.trim() && !image)}
                      onClick={() => void analyze()}
                    >
                      <ShieldCheck size={21} />
                      {busy === "Checking on your device"
                        ? "Checking on your device…"
                        : "Check privately"}
                      {!busy && <span className="button-key">↵</span>}
                    </button>
                    {busy === "Checking on your device" && (
                      <p className="local-progress" role="status">
                        {localProgress}
                      </p>
                    )}
                    {image && error && (
                      <p className="local-progress">{screenshotUnavailable}</p>
                    )}
                    <div className="private-note">
                      <LockKeyhole size={14} />
                      Your message stays on this device. Cloud is always your
                      choice.
                    </div>
                  </div>
                  <div className="examples">
                    <div className="section-label">
                      NOT SURE? TRY AN EXAMPLE <span>Sample messages</span>
                    </div>
                    <div className="example-grid">
                      {examples.map((e, i) => (
                        <button
                          key={e.title}
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
                            <strong>{e.title}</strong>
                            <small>{e.label}</small>
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
                      <span>YOUR PRIVACY FIREWALL</span>
                      <LockKeyhole size={17} />
                    </div>
                    <h2>
                      Private first.
                      <br />
                      Helpful second.
                    </h2>
                    <p>
                      Personal details are removed on your device before you
                      choose to verify online.
                    </p>
                    <div className="redaction-demo">
                      <div>
                        <span>Personal name</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div>
                        <span>Aadhaar number</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div>
                        <span>UPI / phone</span>
                        <code>[REDACTED]</code>
                      </div>
                      <div className="demo-caption">
                        <ShieldCheck size={14} />
                        {result
                          ? `${result.masked} redaction markers · review for missed details`
                          : "Illustration · your actual preview appears after checking"}
                      </div>
                    </div>
                    <div className="flow-step">
                      <span className="step-number">1</span>
                      <div>
                        <strong>Check on your device</strong>
                        <small>
                          Find pressure tactics & mask private details.
                        </small>
                      </div>
                      <span className="local-tag">LOCAL</span>
                    </div>
                    <div className="step-connector" />
                    <div className="flow-step">
                      <span className="step-number optional">2</span>
                      <div>
                        <strong>
                          Review & verify <em>Optional</em>
                        </strong>
                        <small>
                          Only the redacted text. Only with permission.
                        </small>
                      </div>
                    </div>
                    <div className="privacy-bottom">
                      <Check size={16} />
                      No message history stored
                    </div>
                  </div>
                  <div className="gentle-note">
                    <span className="note-icon">
                      <Shield size={20} />
                    </span>
                    <div>
                      <strong>Pressure is a reason to pause.</strong>
                      <p>
                        Before sending money or sharing a code, contact someone
                        you trust through a number you already know.
                      </p>
                    </div>
                  </div>
                  <div className="service-status">
                    <span className="dot" />
                    {status}
                  </div>
                </aside>
              </div>
              {result && (
                <div ref={output} className="results">
                  <div className="result-heading">
                    <div>
                      <span className="badge local">
                        <ShieldCheck size={14} />
                        {result.source === "LOCAL_RULES"
                          ? "LOCAL RULES · NOT AI"
                          : usesAndroidModel
                            ? "NATIVE ON-DEVICE AI"
                            : "ON-DEVICE AI"}
                        {result.ruleAssisted ? " + LOCAL RULES" : ""} ·{" "}
                        {(result.durationMs / 1000).toFixed(2)}s
                      </span>
                      <h2>
                        {!hasAssessableText(result.text)
                          ? "No readable message to assess"
                          : count === 0
                            ? result.source === "LOCAL_RULES"
                              ? "No common pressure phrases matched"
                              : result.ruleAssisted
                                ? "AI assessment incomplete"
                                : "No pressure tactics found"
                            : `${count} of 4 pressure tactics found`}
                      </h2>
                      <p>
                        {!hasAssessableText(result.text)
                          ? "The image may have no readable message, or masking removed all usable text. This is not a safety assessment. Upload a clearer screenshot or paste the message."
                          : result.source === "LOCAL_RULES"
                            ? "This basic check matches common phrases and masks recognizable identifiers. Review for missed pressure signals and private details."
                            : count === 0
                              ? "This is not a guarantee of safety. Verify payment requests independently."
                              : "Pause before you pay. Here’s how this message is applying pressure."}
                      </p>
                      <p className="tool-hint">
                        This count measures pressure tactics, not fraud
                        probability. Zero tactics does not mean the request is
                        genuine.
                      </p>
                    </div>
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
                      Alert family
                    </button>
                  </div>
                  {result.fallbackReason && (
                    <div className="local-progress" role="status">
                      <p>{result.fallbackReason}</p>
                      <p>
                        Last step: {result.fallbackStage}. Error code:{" "}
                        {result.fallbackCode}.
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        disabled={diagnosticsBusy || !!busy}
                        onClick={async () => {
                          setDiagnosticsBusy(true);
                          try {
                            setLocalDiagnostics(await localAIDiagnostics());
                          } finally {
                            setDiagnosticsBusy(false);
                          }
                        }}
                      >
                        {diagnosticsBusy
                          ? "Checking browser support…"
                          : "Check local AI support"}
                      </button>
                      {localDiagnostics && (
                        <ul>
                          <li>Platform: {localDiagnostics.platform}</li>
                          <li>
                            Secure page:{" "}
                            {localDiagnostics.securePage ? "yes" : "no"}
                          </li>
                          <li>
                            Chrome Prompt API exposed:{" "}
                            {localDiagnostics.promptApiExposed ? "yes" : "no"}
                          </li>
                          <li>Text model: {localDiagnostics.text}</li>
                          <li>Image model: {localDiagnostics.image}</li>
                        </ul>
                      )}
                    </div>
                  )}
                  {hasAssessableText(result.text) && (
                    <>
                      <PressureEvidence result={result} />
                      {result.ruleAssisted && (
                        <p className="tool-hint">
                          Local AI returned a partial assessment. Its findings
                          are preserved. Missing categories were checked
                          separately with local phrase rules; a missing AI
                          assessment does not mean no pressure.
                        </p>
                      )}
                      {result.preparationMs !== undefined &&
                        result.generationMs !== undefined && (
                          <p className="tool-hint">
                            Preparation:{" "}
                            {(result.preparationMs / 1000).toFixed(1)}s ·
                            Analysis: {(result.generationMs / 1000).toFixed(1)}
                            s. Measured on this device.
                          </p>
                        )}
                      <FamilySafety
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
                              <h3>{s.name}</h3>
                              <small>
                                {s.found
                                  ? "Detected"
                                  : s.assessedByAI === false
                                    ? "No phrase match"
                                    : "Not detected"}
                              </small>
                            </div>
                            <p className="tool-hint">
                              {s.assessmentSource === "LOCAL_RULES"
                                ? result.source === "ON_DEVICE"
                                  ? "Not assessed by AI · LOCAL RULES"
                                  : "LOCAL RULES · NOT AI"
                                : "ON-DEVICE AI"}
                            </p>
                            {s.found && (
                              <>
                                <blockquote>“{s.evidence}”</blockquote>
                                <p>{s.action}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      {!!result.imageMismatches?.length && (
                        <section className="card family-safety">
                          <h3>Possible screenshot mismatches</h3>
                          <p>
                            These are observations from the image. Verify them
                            independently.
                          </p>
                          <ul>
                            {result.imageMismatches.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      )}
                      <details className="local-tools-drawer">
                        <summary>Polish your reply · Optional</summary>
                        <LocalTools
                          key={`local-tools:${result.text}`}
                          text={result.text}
                        />
                      </details>
                    </>
                  )}
                  <div className="card cloud-invite">
                    <Cloud size={28} />
                    <div>
                      <h3>Want a second layer of verification?</h3>
                      <p>
                        Automated masking can miss details. Please check the
                        redacted text carefully before approving. Choose a
                        hybrid second opinion or a cloud check of public
                        sources.{" "}
                        {!hasAssessableText(result.text) &&
                          "Verification is unavailable because no readable message remains. Your image has not been uploaded."}
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={!!busy || !hasAssessableText(result.text)}
                      onClick={() => {
                        setReview(true);
                        setConsent(false);
                      }}
                    >
                      Review & verify
                    </button>
                  </div>
                </div>
              )}
              <AlreadyPaid key={result?.text ?? "no-report"} result={result} />
              {cloud && <CloudAssessment key={cloud.text} cloud={cloud} />}
              <div className="page-footer">
                <LockKeyhole size={14} />
                <span>Your instincts matter. We help you check the facts.</span>
                <span className="footer-right">
                  Built for a safer everyday.
                </span>
              </div>
            </>
          )}
          {tab === "family" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">A TRUSTED SECOND PAIR OF EYES</span>
                <h1>
                  Your family <span>circle.</span>
                </h1>
                <p>Ask for help without sharing your private message.</p>
              </div>
              <div className="family-layout">
                <section className="card">
                  <h2>Connect someone you trust</h2>
                  <p>
                    Invite one person using a single-use code. It expires in 10
                    minutes.
                  </p>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void task("Creating invite", async () =>
                        setInvite((await createInvite()).code),
                      )
                    }
                  >
                    <Users size={18} />
                    Create invitation
                  </button>
                  {invite && (
                    <div className="invite-code">
                      <code>{invite}</code>
                      <button
                        className="secondary"
                        onClick={() =>
                          void task("Copying invitation", async () => {
                            await navigator.clipboard.writeText(invite);
                            setNotice(
                              "Invitation copied. Share it privately with your family member.",
                            );
                          })
                        }
                      >
                        <Copy size={16} />
                        Copy
                      </button>
                    </div>
                  )}
                  <hr />
                  <label htmlFor="family-code">Have an invitation?</label>
                  <input
                    id="family-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Paste your family member’s code"
                  />
                  <button
                    className="secondary"
                    disabled={!!busy || !code.trim()}
                    onClick={() =>
                      void task("Joining family", async () => {
                        await joinFamily(code);
                        setCode("");
                        setNotice("Family connection established.");
                      })
                    }
                  >
                    Join family circle
                  </button>
                </section>
                <section className="card">
                  <h2>People & notifications</h2>
                  <p>
                    {members.length
                      ? `${members.length} trusted connection(s)`
                      : "No one paired yet. Create or accept an invitation to get started."}
                  </p>
                  {members.map((m, i) => (
                    <div className="member" key={m}>
                      <Users size={20} />
                      <span>Family member {i + 1}</span>
                      <button
                        aria-label={`Remove family member ${i + 1}`}
                        onClick={() =>
                          void task("Removing connection", async () => {
                            await removeMember(m);
                          })
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void task("Enabling notifications", async () => {
                        await enableNotifications();
                        setNotice("Notifications enabled on this device.");
                      })
                    }
                  >
                    <Bell size={18} />
                    Enable notifications
                  </button>
                  <h3 className="inbox-title">Help requests</h3>
                  {alerts.length ? (
                    alerts.map((a) => (
                      <div className="alert-item" key={a.id}>
                        <Bell size={18} />
                        <span>
                          Help requested · {a.stages}/4 stages
                          <br />
                          <small>
                            Call your family member on their saved number.
                          </small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-note">Your family inbox is clear.</p>
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "privacy" && (
            <div className="privacy-page">
              <div className="page-heading">
                <span className="eyebrow">YOU ARE IN CONTROL</span>
                <h1>
                  Your data. <span>Your decision.</span>
                </h1>
                <p>Here’s exactly what stays and what leaves.</p>
              </div>
              <div className="privacy-section-grid">
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <LockKeyhole size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>On this device</h2>
                    <p>
                      Your original text and screenshots stay in the app’s
                      memory during the private check. VaultShield does not save
                      these messages in Firestore or browser storage.
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Cloud size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>Only after your permission</h2>
                    <p>
                      You review and approve the exact redacted text before
                      verification can use cloud AI or Google Search. Check for
                      private details the redaction may have missed.
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Users size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>When you alert family</h2>
                    <p>
                      VaultShield uses your anonymous account ID to send a help
                      request with the pressure count and time. The alert
                      contains no original message, screenshot, or location.
                    </p>
                  </div>
                </section>
                <section className="card privacy-section">
                  <div className="icon-tile">
                    <Info size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2>What your device supports</h2>
                    <p>
                      On-device AI needs a compatible desktop Chrome setup or
                      Android with AICore. When the model is unavailable, basic
                      checks can still run on pasted text. Verify payment
                      requests independently.
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
                  <h2 id="privacy-diagnostics-title">Diagnostics</h2>
                  <dl>
                    <dt>Platform</dt>
                    <dd>{capability.platform}</dd>
                    <dt>Text engine</dt>
                    <dd>{capability.textEngine}</dd>
                    <dt>Screenshot engine</dt>
                    <dd>{capability.screenshotEngine}</dd>
                    <dt>Local model</dt>
                    <dd>{diagnostics.modelStatus}</dd>
                    <dt>ML Kit status</dt>
                    <dd>{diagnostics.mlKitStatus ?? "—"}</dd>
                    <dt>Last error</dt>
                    <dd>
                      {diagnostics.lastError || "None reported"}{" "}
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
        <div className="modal-overlay">
          <section
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <button
              className="modal-close"
              aria-label="Close review"
              disabled={!!busy}
              onClick={() => setReview(false)}
            >
              <X />
            </button>
            <span className="badge cloud">
              <Cloud size={14} />
              OPTIONAL · REVIEW & VERIFY
            </span>
            <h2 id="consent-title">You choose what leaves.</h2>
            <p>
              Remove any remaining private details. Only the reviewed text can
              go to the cloud. Your screenshot stays on this device.
            </p>
            <fieldset className="verification-options" disabled={!!busy}>
              <legend>What would you like to check?</legend>
              <label>
                <input
                  type="radio"
                  name="verification-purpose"
                  value="hybrid"
                  checked={verificationPurpose === "hybrid"}
                  onChange={() => {
                    setVerificationPurpose("hybrid");
                    setConsent(false);
                  }}
                />
                <span>
                  <strong>Get a second opinion</strong>
                  <small>
                    Firebase prefers local AI, with approved cloud fallback. No
                    live web search.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="verification-purpose"
                  value="public-sources"
                  checked={verificationPurpose === "public-sources"}
                  onChange={() => {
                    setVerificationPurpose("public-sources");
                    setConsent(false);
                  }}
                />
                <span>
                  <strong>Check public sources online</strong>
                  <small>
                    Send the reviewed text to cloud AI with Google Search.
                    Sources may be unavailable or inconclusive.
                  </small>
                </span>
              </label>
            </fieldset>
            <label htmlFor="redacted">Text approved for AI</label>
            <textarea
              id="redacted"
              value={edit}
              maxLength={16000}
              disabled={!!busy}
              onChange={(e) => {
                setEdit(e.target.value);
                setConsent(false);
              }}
            />
            {!hasAssessableText(edit) && (
              <p className="local-progress" role="status">
                There is no readable message left to verify—only masked details
                or empty text. Add the message wording before approving. Your
                screenshot stays on this device.
              </p>
            )}
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={!!busy || !hasAssessableText(edit)}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {verificationPurpose === "public-sources"
                ? "I reviewed this text and approve sending it to Google’s cloud AI for public-source checking with Google Search."
                : "I reviewed this text and approve Google’s cloud AI processing it if Firebase cannot use the local model."}
            </label>
            <button
              className="primary"
              disabled={!consent || !!busy || !hasAssessableText(edit)}
              onClick={submitReviewedText}
            >
              <Cloud size={18} />
              {busy === "Verifying approved text"
                ? "Verifying…"
                : "Approve & verify"}
            </button>
            <p>
              Only the reviewed text is approved. AI can miss details; review
              names, account details and private clauses before continuing.
            </p>
            {error && (
              <p role="alert" className="modal-error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
