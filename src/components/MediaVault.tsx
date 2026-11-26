import { useRef, useState } from "react";
import { t, useAppLanguage } from "../lib/i18n";
import {
  Film,
  Upload,
  Lock,
  Cloud,
  MessageSquare,
  Send,
  Bot,
  X,
  FileAudio,
  Image,
  Video,
  Languages,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { TokenVaultSession } from "../lib/tokenVault";
import { chatWithDocument, analyzeMediaFile } from "../lib/firebase/ai";
import TokenVaultPreview from "./TokenVaultPreview";

type ChatMsg = { role: "user" | "ai"; text: string };
type MediaKind = "audio" | "image" | "video";

const AUDIO_TYPES = "audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/aac,audio/flac";
const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const VIDEO_TYPES = "video/mp4,video/webm,video/ogg,video/quicktime";
const ACCEPT_ALL = [AUDIO_TYPES, IMAGE_TYPES, VIDEO_TYPES].join(",");
const MAX_MB = 25;

function detectKind(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "audio";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function MediaVault() {
  const vault = useRef(new TokenVaultSession());
  const fileRef = useRef<HTMLInputElement>(null);
  const language = useAppLanguage();

  const [mediaFile, setMediaFile] = useState<{
    name: string; size: number; mimeType: string; url: string;
    file: File; kind: MediaKind;
  } | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [tokenizedAnalysis, setTokenizedAnalysis] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState("");
  const [processed, setProcessed] = useState(false);
  const [source, setSource] = useState<"ON_DEVICE" | "IN_CLOUD" | null>(null);
  const [error, setError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [piiCount, setPiiCount] = useState(0);

  function reset() {
    if (mediaFile) URL.revokeObjectURL(mediaFile.url);
    setMediaFile(null);
    setAnalysis("");
    setTokenizedAnalysis("");
    setProcessing(false);
    setProcessStatus("");
    setProcessed(false);
    setSource(null);
    setError("");
    setChatMessages([]);
    setChatInput("");
    vault.current.clear();
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    setError("");
    const kind = detectKind(f.type);
    const validTypes = [...AUDIO_TYPES.split(","), ...IMAGE_TYPES.split(","), ...VIDEO_TYPES.split(",")];
    if (!validTypes.includes(f.type) && !f.type.startsWith("audio/") && !f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("Select an audio, image, or video file.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB.`);
      return;
    }
    reset();
    setMediaFile({ name: f.name, size: f.size, mimeType: f.type, url: URL.createObjectURL(f), file: f, kind });
  }

  async function process() {
    if (!mediaFile || processing) return;
    setProcessing(true);
    setError("");
    setAnalysis("");
    setTokenizedAnalysis("");
    setProcessed(false);
    vault.current.clear();
    try {
      const instructions: Record<MediaKind, string> = {
        image: "Describe this image and extract all visible text.",
        audio: "Transcribe this audio recording verbatim. Note any suspicious patterns.",
        video: "Transcribe all speech from this video verbatim. Note any suspicious visual or audio patterns.",
      };
      setProcessStatus(`Sending ${mediaFile.kind} to cloud Gemini…`);
      const b64 = await fileToBase64(mediaFile.file);
      const { text } = await analyzeMediaFile(b64, mediaFile.mimeType, instructions[mediaFile.kind]);
      const raw = text;
      setSource("IN_CLOUD");
      setAnalysis(raw);
      const tokenized = vault.current.tokenize(raw);
      setTokenizedAnalysis(tokenized.text);
      setProcessed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed.";
      const isBilling = msg.includes("429") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("billing");
      setError(isBilling
        ? "AI quota exhausted. Enable billing at aistudio.google.com then retry."
        : msg,
      );
    } finally {
      setProcessing(false);
      setProcessStatus("");
    }
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatBusy || !processed) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const { answer } = await chatWithDocument(q, tokenizedAnalysis, vault.current);
      setChatMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const isBilling = msg.includes("429") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("quota");
      setChatMessages((prev) => [...prev, {
        role: "ai",
        text: isBilling
          ? "AI quota exhausted. Enable billing at aistudio.google.com to continue."
          : "Sorry, couldn't get a response. Please try again.",
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  const kind = mediaFile?.kind ?? "audio";
  const KindIcon = kind === "image" ? Image : kind === "video" ? Video : FileAudio;

  const flowSteps = [
    { icon: Upload, label: t("Upload file"), sub: t("Stays local until sent") },
    { icon: Cloud, label: t("Cloud AI reads"), sub: t("Gemini · sent once") },
    { icon: Lock, label: t("PII masked"), sub: t("TokenVault on-device") },
    { icon: MessageSquare, label: t("Chat privately"), sub: t("Tokens only to cloud") },
  ];

  const quickQuestions = kind === "image"
    ? [t("What does this image show?"), t("Any red flags?"), t("Extract all text"), t("Summarise in 3 points")]
    : [t("Was this a scam call?"), t("What did the caller want?"), t("Are there red flags?"), t("Summarise in 3 points")];

  return (
    <div className="call-vault">
      <div className="page-heading">
        <span className="eyebrow">
          <span className="tiny-line" />
          {t("MEDIA VAULT — PRIVATE MEDIA ANALYSIS")}
        </span>
        <h1>
          {t("Your file.")} <span>{t("Your analysis.")}</span>
        </h1>
        <p>
          {t("All media analyzed by cloud Gemini — file sent once, not stored. Follow-up chat always masks PII before any cloud request.")}
        </p>
      </div>

      <div className="call-vault-flow">
        {flowSteps.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="call-vault-step">
            <Icon size={18} />
            <strong>{label}</strong>
            <span>{sub}</span>
          </div>
        ))}
      </div>

      <div className="workspace">
        <section className="check-column">
          <div className="card input-card">
            <div className="card-title">
              <div className="icon-tile"><Film size={23} /></div>
              <div>
                <h2>{t("Upload media file")}</h2>
                <p>{t("Audio · Image · Video — max 25 MB")}</p>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ALL}
              className="sr-only"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
            />

            {mediaFile ? (
              <div className="call-vault-file-preview">
                <KindIcon size={22} />
                <div className="call-vault-file-info">
                  <span className="call-vault-fname">{mediaFile.name}</span>
                  <span className="call-vault-fsize">
                    {(mediaFile.size / 1024 / 1024).toFixed(1)} MB · {mediaFile.kind}
                  </span>
                </div>
                {mediaFile.kind === "audio" && (
                  <audio controls src={mediaFile.url} className="call-vault-audio" />
                )}
                {mediaFile.kind === "video" && (
                  <video controls src={mediaFile.url} className="call-vault-audio" style={{ maxHeight: 120 }} />
                )}
                {mediaFile.kind === "image" && (
                  <img src={mediaFile.url} alt="Preview" style={{ maxHeight: 120, borderRadius: 8, objectFit: "contain", width: "100%" }} />
                )}
                <button aria-label="Remove" onClick={reset} style={{ alignSelf: "flex-start" }}><X size={18} /></button>
              </div>
            ) : (
              <button
                type="button"
                className="doc-upload-zone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
              >
                <Film size={24} />
                <span>{t("Upload audio, image, or video")}</span>
                <span className="doc-upload-hint">MP3 · WAV · MP4 · JPG · PNG · max {MAX_MB} MB</span>
              </button>
            )}

            {mediaFile && !processed && (
              <>
                <div className="call-vault-cloud-note" style={{ background: "#fefce8", border: "1px solid #fde68a", color: "#854d0e" }}>
                  <Cloud size={14} />
                  <span>File sent once to cloud Gemini for analysis — not stored. All follow-up chat masks PII before leaving your device.</span>
                </div>
                <button
                  type="button"
                  className="primary check-button"
                  disabled={processing}
                  onClick={() => void process()}
                >
                  <Cloud size={18} />
                  {processing ? "Analyzing…" : "Analyze with Gemini"}
                  {processing && <span className="step-spinner" aria-hidden="true" />}
                </button>
                {processing && processStatus && (
                  <p className="local-progress" role="status">{processStatus}</p>
                )}
              </>
            )}

            {processed && (
              <div className="call-vault-done-badge">
                <CheckCircle size={16} />
                {kind === "image" ? t("Image analyzed") : t("Transcribed")} · {t("PII masked")}
                {source === "IN_CLOUD" && (
                  <span className="call-vault-src-badge cloud"><Cloud size={10} /> Cloud AI</span>
                )}
                {source === "ON_DEVICE" && (
                  <span className="call-vault-src-badge ondevice"> On-device</span>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="banner error">
                <AlertTriangle size={18} />
                <span>{error}</span>
                <button aria-label="Dismiss" onClick={() => setError("")}><X size={16} /></button>
              </div>
            )}
          </div>

          {analysis && (
            <div className="card call-vault-transcript-card">
              <div className="card-title">
                <div className="icon-tile"><KindIcon size={20} /></div>
                <div>
                  <h2>{kind === "image" ? t("Analysis") : t("Transcript")}</h2>
                  <p>{t("Stored only on this device")}</p>
                </div>
              </div>
              <pre className="call-vault-transcript">{analysis}</pre>
              <details className="call-vault-xray" open>
                <summary><Lock size={13} /> {t("Privacy X-Ray — what cloud sees when you chat")}</summary>
                <div className="call-vault-xray-body">
                  <TokenVaultPreview input={analysis} onCountChange={setPiiCount} />
                  {piiCount > 0 && (
                    <p className="call-vault-xray-note">
                      {piiCount} identifier{piiCount !== 1 ? "s" : ""} masked — cloud only receives tokens like [PERSON_1].
                    </p>
                  )}
                </div>
              </details>
              {analysis.toLowerCase().includes("english translation:") && (
                <div className="call-vault-translate-badge">
                  <Languages size={14} />
                  Non-English content detected — English translation included.
                </div>
              )}
            </div>
          )}
        </section>

        {processed && (
          <section className="assessment-column">
            <div className="card doc-chat">
              <div className="card-title">
                <div className="icon-tile"><MessageSquare size={20} /></div>
                <div>
                  <h2>{t("Chat about this")} {kind}</h2>
                  <p>{t("Questions PII-masked · Cloud sees tokens only")}</p>
                </div>
              </div>
              <div className="doc-chat-messages" aria-live="polite">
                {chatMessages.length === 0 && (
                  <div className="doc-chat-empty">
                    <Bot size={20} />
                    <span>{t("Ask anything about the")} {kind}.</span>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`doc-chat-bubble ${msg.role}`}>
                    {msg.role === "ai" && (
                      <span className="doc-chat-ai-label"><Lock size={10} /> AI · PII masked</span>
                    )}
                    <p>{msg.text}</p>
                  </div>
                ))}
                {chatBusy && (
                  <div className="doc-chat-bubble ai loading">
                    <span className="step-spinner" aria-hidden="true" />
                    <span>Thinking…</span>
                  </div>
                )}
              </div>
              {chatMessages.length === 0 && (
                <div className="call-vault-quick-qs">
                  {quickQuestions.map((q) => (
                    <button key={q} type="button" className="call-vault-q-chip" onClick={() => setChatInput(q)}>{q}</button>
                  ))}
                </div>
              )}
              <div className="doc-chat-input-row">
                <textarea
                  className="doc-chat-textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                  placeholder={`Ask about this ${kind}…`}
                  rows={2}
                  disabled={chatBusy}
                  maxLength={1000}
                />
                <button
                  type="button"
                  className="primary doc-chat-send"
                  disabled={!chatInput.trim() || chatBusy}
                  onClick={() => void sendChat()}
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

