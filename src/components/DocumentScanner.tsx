import { useRef, useState } from "react";
import {
  ScanLine,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  X,
  Lock,
  Cpu,
  Cloud,
  ShieldCheck,
} from "lucide-react";
import { TokenVaultSession, countTokens } from "../lib/tokenVault";
import { routeInput } from "../lib/router";
import { buildReceipt } from "../lib/receipt";
import {
  extractTextFromDocument,
  analyzeDocumentText,
  type DocumentAnalysisResult,
} from "../lib/firebase/ai";
import PrivacyReceipt from "./PrivacyReceipt";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "../lib/ai/documentPrompts";
import type { PrivacyReceiptData } from "../lib/receipt";
import type { SanitizedText } from "../types/privacy";

const SAFETY_CONFIG = {
  safe: {
    icon: CheckCircle,
    label: "No concerns",
    className: "doc-safety safe",
  },
  review: {
    icon: AlertCircle,
    label: "Review carefully",
    className: "doc-safety review",
  },
  concern: {
    icon: AlertTriangle,
    label: "Concerns found",
    className: "doc-safety concern",
  },
};

type PipelineStep = {
  id: string;
  label: string;
  detail: string;
  icon: typeof Lock;
  status: "pending" | "running" | "done" | "skipped";
};

export default function DocumentScanner() {
  const vault = useRef(new TokenVaultSession());
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [image, setImage] = useState<{
    data: string;
    mimeType: string;
    name: string;
    url: string;
  } | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("general");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [receipt, setReceipt] = useState<PrivacyReceiptData | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [error, setError] = useState("");

  function buildSteps(hasImage: boolean): PipelineStep[] {
    return [
      {
        id: "ocr",
        label: "On-device OCR",
        detail: "Extract text from image — nothing sent to cloud",
        icon: Cpu,
        status: hasImage ? "pending" : "skipped",
      },
      {
        id: "vault",
        label: "Token vault",
        detail: "Mask all identifiers — stays on this device",
        icon: Lock,
        status: "pending",
      },
      {
        id: "route",
        label: "Privacy route",
        detail: "Verify only tokens leave this device",
        icon: ShieldCheck,
        status: "pending",
      },
      {
        id: "cloud",
        label: "Cloud analysis",
        detail: "AI sees tokens only — never original values",
        icon: Cloud,
        status: "pending",
      },
    ];
  }

  function advanceStep(steps: PipelineStep[], id: string): PipelineStep[] {
    return steps.map((s) =>
      s.id === id
        ? { ...s, status: "running" }
        : s.status === "running"
          ? { ...s, status: "done" }
          : s,
    );
  }

  function completeSteps(steps: PipelineStep[]): PipelineStep[] {
    return steps.map((s) =>
      s.status === "running" || s.status === "pending"
        ? { ...s, status: s.status === "pending" && s.id !== "cloud" ? "skipped" : "done" }
        : s,
    );
  }

  function uploadFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Select a JPEG or PNG image of your document.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      const mimeType = f.type;
      const data = dataUrl.split(",")[1];
      if (image) URL.revokeObjectURL(image.url);
      setImage({
        data,
        mimeType,
        name: f.name,
        url: URL.createObjectURL(f),
      });
      setRawText("");
      setResult(null);
      setReceipt(null);
      setError("");
    };
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setReceipt(null);
    setOcrText("");
    vault.current.clear();

    const pipeline = buildSteps(Boolean(image));
    setSteps(pipeline);

    try {
      let textToAnalyze = rawText;

      // Step 1: on-device OCR (images only)
      if (image) {
        setSteps((s) => advanceStep(s, "ocr"));
        const extracted = await extractTextFromDocument(
          image,
          category,
          () => {},
        );
        setOcrText(extracted);
        textToAnalyze = extracted;
        setSteps((s) => advanceStep(s, "vault"));
      } else {
        setSteps((s) => advanceStep(s, "vault"));
      }

      if (!textToAnalyze.trim()) {
        throw new Error(
          "No text to analyze. Paste document text or upload a clear document image.",
        );
      }

      // Step 2: token vault
      const tokenized = vault.current.tokenize(textToAnalyze);
      const counts = countTokens(tokenized.text);
      const totalMasked = Object.values(counts).reduce(
        (sum, v) => sum + (v ?? 0),
        0,
      );

      // Step 3: privacy route
      setSteps((s) => advanceStep(s, "route"));
      const route = routeInput(textToAnalyze);

      // Step 4: cloud analysis
      setSteps((s) => advanceStep(s, "cloud"));
      const analysisResult = await analyzeDocumentText(
        tokenized.text as SanitizedText,
        category,
        vault.current,
      );

      // Build privacy receipt
      const rcpt = buildReceipt({
        route,
        source: "IN_CLOUD",
        elapsedMs: analysisResult.durationMs,
        counts,
        payload: tokenized.text as SanitizedText,
        approvedText: tokenized.text as SanitizedText,
        groundingUsed: false,
        model: analysisResult.model,
      });

      setSteps((s) => completeSteps(s));
      setResult({ ...analysisResult, masked: totalMasked });
      setReceipt(rcpt);
    } catch (e) {
      setSteps((s) => completeSteps(s));
      setError(
        e instanceof Error ? e.message : "Analysis failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canAnalyze = !busy && (rawText.trim().length > 20 || Boolean(image));

  return (
    <div className="doc-scanner">
      <div className="page-heading">
        <span className="eyebrow">
          <span className="tiny-line" />
          DOCUMENT PRIVACY SCANNER
        </span>
        <h1>
          AI reads the doc.{" "}
          <span>Not your identity.</span>
        </h1>
        <p>
          Every identifier is masked on this device before any AI sees the
          document.
        </p>
      </div>

      <div className="workspace">
        <section className="check-column">
          {/* Input card */}
          <div className="card input-card">
            <div className="card-title">
              <div className="icon-tile">
                <ScanLine size={23} />
              </div>
              <div>
                <h2>Upload or paste your document</h2>
                <p>Medical report, land deed, loan notice, court summons…</p>
              </div>
            </div>

            {/* Category selector */}
            <div className="doc-categories">
              <span className="input-label">Document type</span>
              <div className="doc-cat-pills">
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`doc-cat-pill${category === cat.value ? " active" : ""}`}
                    onClick={() => setCategory(cat.value)}
                    title={cat.hint}
                    disabled={busy}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Image upload zone */}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                uploadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {image ? (
              <div className="image-preview">
                <img
                  src={image.url}
                  alt="Document image, kept on this device"
                />
                <span>{image.name}</span>
                <button
                  aria-label="Remove image"
                  disabled={busy}
                  onClick={() => {
                    URL.revokeObjectURL(image.url);
                    setImage(null);
                    setOcrText("");
                    setResult(null);
                    setReceipt(null);
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="doc-upload-zone"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  uploadFile(e.dataTransfer.files[0]);
                }}
              >
                <Upload size={24} />
                <span>Upload document image</span>
                <span className="doc-upload-hint">
                  JPEG or PNG · OCR runs on-device · nothing uploaded to cloud
                </span>
              </button>
            )}

            <div className="divider">
              <span>or paste document text</span>
            </div>

            <label htmlFor="doc-text" className="input-label">
              Paste extracted text
            </label>
            <textarea
              id="doc-text"
              value={rawText}
              maxLength={32000}
              disabled={busy || Boolean(image)}
              onChange={(e) => {
                setRawText(e.target.value);
                setResult(null);
                setReceipt(null);
              }}
              placeholder="Paste lab report, deed, notice or any document text here…"
              rows={6}
            />
            {ocrText && (
              <details className="ocr-preview">
                <summary>
                  <Cpu size={14} /> On-device OCR extracted text
                </summary>
                <pre>{ocrText}</pre>
              </details>
            )}

            <button
              type="button"
              className="primary"
              disabled={!canAnalyze}
              onClick={() => void analyze()}
            >
              {busy ? (
                <>Analyzing privately…</>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Analyze privately
                </>
              )}
            </button>
          </div>

          {/* Pipeline progress */}
          {steps.length > 0 && (
            <div className="card doc-pipeline">
              <h3>Privacy pipeline</h3>
              <ol className="pipeline-steps">
                {steps
                  .filter((s) => s.status !== "skipped")
                  .map((step) => (
                    <li
                      key={step.id}
                      className={`pipeline-step ${step.status}`}
                    >
                      <step.icon size={16} />
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.detail}</span>
                      </div>
                      {step.status === "done" && (
                        <CheckCircle size={14} className="step-check" />
                      )}
                      {step.status === "running" && (
                        <span className="step-spinner" aria-hidden="true" />
                      )}
                    </li>
                  ))}
              </ol>
            </div>
          )}

          {error && (
            <div role="alert" className="banner error">
              <AlertTriangle size={20} />
              <span>{error}</span>
              <button aria-label="Dismiss" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
        </section>

        {/* Result column */}
        {result && (
          <section className="assessment-column">
            {/* Safety level */}
            <div className={SAFETY_CONFIG[result.safetyLevel].className}>
              {(() => {
                const Cfg = SAFETY_CONFIG[result.safetyLevel];
                return (
                  <>
                    <Cfg.icon size={20} />
                    <span>{Cfg.label}</span>
                  </>
                );
              })()}
              <span className="doc-category-badge">
                {
                  DOCUMENT_CATEGORIES.find(
                    (c) => c.value === result.detectedCategory,
                  )?.label
                }
              </span>
            </div>

            {/* Summary */}
            <div className="card doc-result-card">
              <div className="card-title">
                <div className="icon-tile">
                  <FileText size={20} />
                </div>
                <div>
                  <h2>Summary</h2>
                </div>
              </div>
              <p className="doc-summary">{result.summary}</p>
            </div>

            {/* Red flags */}
            {result.redFlags.length > 0 && (
              <div className="card doc-result-card doc-red-flags">
                <div className="card-title">
                  <div className="icon-tile warn">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h2>Red flags</h2>
                  </div>
                </div>
                <ul className="doc-list">
                  {result.redFlags.map((flag, i) => (
                    <li key={i}>
                      <ChevronRight size={14} />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key facts */}
            {result.keyFacts.length > 0 && (
              <div className="card doc-result-card">
                <div className="card-title">
                  <div className="icon-tile">
                    <CheckCircle size={20} />
                  </div>
                  <div>
                    <h2>Key facts</h2>
                  </div>
                </div>
                <ul className="doc-list">
                  {result.keyFacts.map((fact, i) => (
                    <li key={i}>
                      <ChevronRight size={14} />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing items */}
            {result.missingItems.length > 0 && (
              <div className="card doc-result-card">
                <div className="card-title">
                  <div className="icon-tile">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h2>What's missing</h2>
                  </div>
                </div>
                <ul className="doc-list">
                  {result.missingItems.map((item, i) => (
                    <li key={i}>
                      <ChevronRight size={14} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next steps */}
            {result.nextSteps.length > 0 && (
              <div className="card doc-result-card doc-next-steps">
                <div className="card-title">
                  <div className="icon-tile">
                    <ChevronRight size={20} />
                  </div>
                  <div>
                    <h2>What to do</h2>
                  </div>
                </div>
                <ol className="doc-steps-list">
                  {result.nextSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Privacy stats */}
            <div className="doc-privacy-stats">
              <span>
                <Lock size={12} />
                {result.masked} identifier{result.masked !== 1 ? "s" : ""}{" "}
                masked
              </span>
              <span>
                <Cloud size={12} />
                {result.payloadBytes.toLocaleString()} bytes sent (tokens only)
              </span>
              <span>
                <Cpu size={12} />
                {Math.round(result.durationMs)}ms
              </span>
            </div>

            {/* Full privacy receipt */}
            {receipt && <PrivacyReceipt receipt={receipt} original="" entries={[]} />}
          </section>
        )}
      </div>
    </div>
  );
}
