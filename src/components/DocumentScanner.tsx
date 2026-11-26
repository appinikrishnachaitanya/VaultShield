import { useRef, useState } from "react";
import { t, useAppLanguage } from "../lib/i18n";
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
  MessageSquare,
  Send,
  Bot,
} from "lucide-react";
import { TokenVaultSession, countTokens } from "../lib/tokenVault";
import { routeInput } from "../lib/router";
import { buildReceipt } from "../lib/receipt";
import {
  extractTextFromDocument,
  analyzeDocumentText,
  type DocumentAnalysisResult,
  chatWithDocument,
} from "../lib/firebase/ai";
import PrivacyReceipt from "./PrivacyReceipt";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "../lib/ai/documentPrompts";
import type { PrivacyReceiptData } from "../lib/receipt";
import type { SanitizedText } from "../types/privacy";
import { extractPdfContent } from "../lib/pdfExtractor";

const SAFETY_CONFIG = {
  safe: {
    icon: CheckCircle,
    label: t("No concerns"),
    className: "doc-safety safe",
  },
  review: {
    icon: AlertCircle,
    label: t("Review carefully"),
    className: "doc-safety review",
  },
  concern: {
    icon: AlertTriangle,
    label: t("Concerns found"),
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
  const language = useAppLanguage();
  const [rawText, setRawText] = useState("");
  const [image, setImage] = useState<{
    data: string;
    mimeType: string;
    name: string;
    url: string;
  } | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ name: string; pageCount: number } | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("general");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [receipt, setReceipt] = useState<PrivacyReceiptData | null>(null);
  const [pdfImages, setPdfImages] = useState<Array<{ data: string; mimeType: string; name: string; url: string }>>([]);
  const [ocrText, setOcrText] = useState("");
  const [error, setError] = useState("");
  type ChatMessage = { role: "user" | "ai"; text: string };
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [tokenizedDocText, setTokenizedDocText] = useState("");

  function buildSteps(hasImage: boolean, hasPdfText: boolean, pdfImageCount = 0): PipelineStep[] {
    const ocrLabel = pdfImageCount > 1
      ? `On-device OCR — ${pdfImageCount} pages`
      : hasPdfText ? "PDF text extracted" : "On-device OCR";
    return [
      {
        id: "ocr",
        label: ocrLabel,
        detail: hasPdfText
          ? "Text layer parsed on-device — nothing sent to cloud"
          : "Extract text from image — nothing sent to cloud",
        icon: Cpu,
        status: hasImage || hasPdfText || pdfImageCount > 0 ? "pending" : "skipped",
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

  async function handleChat() {
    if (!chatInput.trim() || chatBusy || !result) return;
    const q = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const { answer } = await chatWithDocument(q, tokenizedDocText || "(no document scanned)", vault.current, language);
      setChatMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "ai", text: "Sorry, couldn't get an answer. Please try again." }]);
    } finally {
      setChatBusy(false);
    }
  }

  function clearFile() {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
    setPdfImages([]);
    setPdfMeta(null);
    setOcrText("");
    setResult(null);
    setReceipt(null);
  }

  function uploadFile(f: File | undefined) {
    if (!f) return;
    const isPdf = f.type === "application/pdf";
    const isImage = f.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setError("Select a JPEG, PNG or PDF file.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("File must be under 20 MB.");
      return;
    }
    setError("");
    setResult(null);
    setReceipt(null);

    if (isPdf) {
      clearFile();
      setBusy(true);
      extractPdfContent(f)
        .then((extracted) => {
          setPdfMeta({ name: f.name, pageCount: extracted.pageCount });
          if (extracted.text.length > 30) setRawText(extracted.text);
          if (extracted.images.length > 0) {
            // Store all rendered page images for multi-page OCR
            setPdfImages(extracted.images);
          } else if (extracted.text.length <= 30) {
            setError("Could not extract text from this PDF. Try pasting the text manually.");
          }
        })
        .catch(() => setError("Failed to read PDF. Try a different file or paste the text."))
        .finally(() => setBusy(false));
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
      clearFile();
      setImage({ data, mimeType, name: f.name, url: URL.createObjectURL(f) });
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

    const hasPdfText = Boolean(pdfMeta && rawText);
    const hasPdfImages = pdfImages.length > 0;
    const pipeline = buildSteps(Boolean(image), hasPdfText && !hasPdfImages, hasPdfImages ? pdfImages.length : 0);
    setSteps(pipeline);

    try {
      let textToAnalyze = rawText;

      // Step 1: on-device OCR
      if (hasPdfImages) {
        // Multi-page image PDF (or mixed): OCR each rendered page, combine with any text-layer text
        setSteps((s) => advanceStep(s, "ocr"));
        const pageTexts: string[] = rawText ? [rawText] : [];
        for (const pageImg of pdfImages) {
          const pageText = await extractTextFromDocument(pageImg, category, () => {});
          if (pageText) pageTexts.push(pageText);
        }
        const combined = pageTexts.join("\n\n");
        setOcrText(combined);
        textToAnalyze = combined;
        setSteps((s) => advanceStep(s, "vault"));
      } else if (hasPdfText) {
        setSteps((s) => advanceStep(s, "ocr"));
        setSteps((s) => advanceStep(s, "vault"));
      } else if (image) {
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
      setTokenizedDocText(tokenized.text);
      const counts = countTokens(tokenized.text);
      const totalMasked = Object.values(counts).reduce(
        (sum, v) => sum + (v ?? 0),
        0,
      );

      // Step 3: privacy route
      setSteps((s) => advanceStep(s, "route"));
      const route = routeInput(textToAnalyze);

      // Step 4: local or cloud analysis
      setSteps((s) => advanceStep(s, "cloud"));
      const analysisResult = await analyzeDocumentText(
        tokenized.text as SanitizedText,
        category,
        vault.current,
        undefined,
        language,
      );

      // Build privacy receipt
      const rcpt = buildReceipt({
        route,
        source: analysisResult.source ?? "IN_CLOUD",
        elapsedMs: analysisResult.durationMs,
        counts,
        payload: tokenized.text as SanitizedText,
        approvedText: tokenized.text as SanitizedText,
        groundingUsed: false,
        model: analysisResult.model,
      });

      setSteps((s) => {
        const done = completeSteps(s);
        if (analysisResult.source === "ON_DEVICE") {
          return done.map((step) =>
            step.id === "cloud"
              ? { ...step, label: "On-device analysis", detail: "Gemma4 / Nano — your data never left this device", icon: Cpu }
              : step,
          );
        }
        return done;
      });
      setResult({ ...analysisResult, masked: totalMasked });
      setReceipt(rcpt);
    } catch (e) {
      setSteps((s) => completeSteps(s));
      const msg = e instanceof Error ? e.message : "Analysis failed. Please try again.";
      const isBilling = msg.includes("429") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("billing");
      setError(
        isBilling
          ? "AI quota exhausted. Enable billing at aistudio.google.com then retry."
          : msg.includes("private value remains")
            ? "Some identifiers could not be fully masked (possible table format). Paste just the relevant section without table formatting."
            : msg,
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
          {t("DOCUMENT VAULT")}
        </span>
        <h1>
          {t("AI reads the doc.")}{" "}
          <span>{t("Not your identity.")}</span>
        </h1>
        <p>
          {t("Every identifier is masked on this device before any AI sees the document.")}
        </p>
      </div>


      {/* Re-analyze in Hindi when language switched */}
      {language === "hi" && result && !/[\u0900-\u097f]/.test(result.summary) && (
        <div className="banner info" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ flex: 1 }}>भाषा हिंदी में बदली — हिंदी में परिणाम पाने के लिए फिर से Analyze करें।</span>
          <button type="button" className="primary" style={{ whiteSpace: "nowrap" }} onClick={() => void analyze()} disabled={busy}>
            हिंदी में विश्लेषण करें
          </button>
        </div>
      )}
      <div className={result ? "workspace has-result" : "workspace"}>
        <section className="check-column">
          {/* Input card */}
          <div className="card input-card">
            <div className="card-title">
              <div className="icon-tile">
                <ScanLine size={23} />
              </div>
              <div>
                <h2>{t("Upload or paste your document")}</h2>
                <p>{t("Medical report, land deed, loan notice, court summons…")}</p>
              </div>
            </div>

            {/* Category selector */}
            <div className="doc-categories">
              <span className="input-label">{t("Document type")}</span>
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
                    {t(cat.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* File upload zone */}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                uploadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {pdfMeta ? (
              <div className="image-preview pdf-preview">
                <FileText size={28} />
                <div className="pdf-preview-info">
                  <span className="pdf-name">{pdfMeta.name}</span>
                  <span className="pdf-pages">{pdfMeta.pageCount} page{pdfMeta.pageCount !== 1 ? "s" : ""} · text extracted on-device</span>
                </div>
                <button aria-label="Remove PDF" disabled={busy} onClick={clearFile}>
                  <X size={20} />
                </button>
              </div>
            ) : image && !pdfMeta ? (
              <div className="image-preview">
                <img src={image.url} alt="Document image, kept on this device" />
                <span>{image.name}</span>
                <button aria-label="Remove image" disabled={busy} onClick={clearFile}>
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
                <span>{t("Upload document")}</span>
                <span className="doc-upload-hint">
                  {t("PDF · JPEG · PNG · processed on-device · nothing uploaded to cloud")}
                </span>
              </button>
            )}

            <div className="divider">
              <span>{t("or paste document text")}</span>
            </div>

            <label htmlFor="doc-text" className="input-label">
                {t("Paste extracted text")}
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
              placeholder={t("Paste lab report, deed, notice or any document text here…")}
              rows={6}
            />
            {ocrText && (
              <details className="ocr-preview">
                <summary><Cpu size={14} /> {t("On-device OCR extracted text")}</summary>
                <pre>{ocrText}</pre>
              </details>
            )}

            <button
              type="button"
              className="primary check-button"
              disabled={!canAnalyze}
              onClick={() => void analyze()}
            >
              {busy ? (
                <>{t("Analyzing privately…")}</>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  {t("Analyze privately")}
                </>
              )}
            </button>
          </div>

          {/* Pipeline progress */}
          {steps.length > 0 && (
            <div className="card doc-pipeline">
              <h3>{t("Privacy pipeline")}</h3>
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
                  <h2>{t("Summary")}</h2>
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
                    <h2>{t("Red flags")}</h2>
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
                    <h2>{t("Key facts")}</h2>
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
                    <h2>{t("What's missing")}</h2>
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
                    <h2>{t("What to do")}</h2>
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
        {result && (
          <section className="doc-chat-column">
            <div className="card doc-chat">
              <div className="card-title">
                <div className="icon-tile">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h2>{t("Ask about this document")}</h2>
                  <p>{t("Questions are tokenized — your PII stays on this device.")}</p>
                </div>
              </div>
              <div className="doc-chat-messages" aria-live="polite">
                {chatMessages.length === 0 && (
                  <div className="doc-chat-empty">
                    <Bot size={20} />
                    <span>{t("Ask anything about the scanned document.")}</span>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`doc-chat-bubble ${msg.role}`}>
                    {msg.role === "ai" && (
                      <span className="doc-chat-ai-label">
                        <Lock size={10} /> AI · {t("PII masked")}
                      </span>
                    )}
                    <p>{msg.text}</p>
                  </div>
                ))}
                {chatBusy && (
                  <div className="doc-chat-bubble ai loading">
                    <span className="step-spinner" aria-hidden="true" />
                    <span>{t("Thinking…")}</span>
                  </div>
                )}
              </div>
              <div className="doc-chat-input-row">
                <textarea
                  className="doc-chat-textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleChat();
                    }
                  }}
                  placeholder={t("Ask a question about the document…")}
                  rows={2}
                  disabled={chatBusy}
                  maxLength={1000}
                />
                <button
                  type="button"
                  className="primary doc-chat-send"
                  disabled={!chatInput.trim() || chatBusy}
                  onClick={() => void handleChat()}
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
