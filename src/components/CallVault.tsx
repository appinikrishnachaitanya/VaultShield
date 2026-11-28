import { useRef, useState } from "react";
import {
  PhoneIncoming,
  Upload,
  Mic,
  Lock,
  Cpu,
  MessageSquare,
  Send,
  Bot,
  X,
  FileAudio,
  Languages,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { TokenVaultSession } from "../lib/tokenVault";
import { chatWithDocument } from "../lib/firebase/ai";
import { transcribeAudio } from "../lib/localTranscription";
import TokenVaultPreview from "./TokenVaultPreview";

type ChatMsg = { role: "user" | "ai"; text: string };

const ACCEPTED = "audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/aac,audio/flac,video/mp4";
const MAX_MB = 25;

export default function CallVault() {
  const vault = useRef(new TokenVaultSession());
  const fileRef = useRef<HTMLInputElement>(null);

  const [audioFile, setAudioFile] = useState<{
    name: string; size: number; mimeType: string; url: string; file: File;
  } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [tokenizedTranscript, setTokenizedTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const [error, setError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [piiCount, setPiiCount] = useState(0);

  function reset() {
    if (audioFile) URL.revokeObjectURL(audioFile.url);
    setAudioFile(null);
    setTranscript("");
    setTokenizedTranscript("");
    setTranscribing(false);
    setTranscribeStatus("");
    setTranscribed(false);
    setError("");
    setChatMessages([]);
    setChatInput("");
    vault.current.clear();
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    setError("");
    const isAudio = f.type.startsWith("audio/") || f.type === "video/mp4";
    if (!isAudio) {
      setError("Select an audio file (MP3, WAV, M4A, OGG, MP4, WebM, AAC, FLAC).");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB.`);
      return;
    }
    reset();
    setAudioFile({ name: f.name, size: f.size, mimeType: f.type, url: URL.createObjectURL(f), file: f });
  }

  async function transcribe() {
    if (!audioFile || transcribing) return;
    setTranscribing(true);
    setError("");
    setTranscript("");
    setTokenizedTranscript("");
    setTranscribed(false);
    vault.current.clear();
    try {
      const raw = await transcribeAudio(audioFile.file, setTranscribeStatus);
      setTranscript(raw);
      const tokenized = vault.current.tokenize(raw);
      setTokenizedTranscript(tokenized.text);
      setTranscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed. Try again.");
    } finally {
      setTranscribing(false);
      setTranscribeStatus("");
    }
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatBusy || !transcribed) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const { answer } = await chatWithDocument(q, tokenizedTranscript, vault.current, undefined, "recording");
      setChatMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", text: "Sorry, couldn't get a response. Please try again." },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="call-vault">
      <div className="page-heading">
        <span className="eyebrow">
          <span className="tiny-line" />
          CALL VAULT — PRIVATE CALL ANALYSIS
        </span>
        <h1>
          Your call. <span>Your transcript.</span>
        </h1>
        <p>
          Transcription runs entirely on your device — audio never leaves.
          Follow-up chat masks PII before any cloud request.
        </p>
      </div>

      <div className="call-vault-flow">
        {[
          { icon: Upload, label: "Upload recording", sub: "Stays on device" },
          { icon: Cpu, label: "Transcribe locally", sub: "Whisper · on-device" },
          { icon: Lock, label: "PII masked", sub: "TokenVault on-device" },
          { icon: MessageSquare, label: "Chat privately", sub: "Tokens only to cloud" },
        ].map(({ icon: Icon, label, sub }) => (
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
              <div className="icon-tile"><PhoneIncoming size={23} /></div>
              <div>
                <h2>Upload call recording</h2>
                <p>MP3 · WAV · M4A · OGG · AAC · max {MAX_MB} MB</p>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
            />

            {audioFile ? (
              <div className="call-vault-file-preview">
                <FileAudio size={22} />
                <div className="call-vault-file-info">
                  <span className="call-vault-fname">{audioFile.name}</span>
                  <span className="call-vault-fsize">
                    {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <audio controls src={audioFile.url} className="call-vault-audio" />
                <button aria-label="Remove" onClick={reset}><X size={18} /></button>
              </div>
            ) : (
              <button
                type="button"
                className="doc-upload-zone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
              >
                <Upload size={24} />
                <span>Upload call recording</span>
                <span className="doc-upload-hint">
                  MP3, WAV, M4A, MP4, OGG, AAC · Max {MAX_MB} MB
                </span>
              </button>
            )}

            {audioFile && !transcribed && (
              <>
                <div className="call-vault-local-note">
                  <Cpu size={14} />
                  <span>
                    Transcription runs fully on your device using the Whisper AI model.
                    Audio never leaves your browser.
                  </span>
                </div>
                <button
                  type="button"
                  className="primary check-button"
                  disabled={transcribing}
                  onClick={() => void transcribe()}
                >
                  <Mic size={18} />
                  {transcribing ? "Transcribing locally…" : "Transcribe on-device"}
                  {transcribing && <span className="step-spinner" aria-hidden="true" />}
                </button>
                {transcribing && transcribeStatus && (
                  <p className="local-progress" role="status">{transcribeStatus}</p>
                )}
              </>
            )}

            {transcribed && (
              <div className="call-vault-done-badge">
                <CheckCircle size={16} />
                Transcribed locally · Stored on device · PII masked
                <span className="call-vault-src-badge ondevice">
                  <Cpu size={10} /> On-device
                </span>
              </div>
            )}

            {error && (
              <div role="alert" className="banner error">
                <AlertTriangle size={18} />
                <span>{error}</span>
                <button aria-label="Dismiss" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {transcript && (
            <div className="card call-vault-transcript-card">
              <div className="card-title">
                <div className="icon-tile"><FileAudio size={20} /></div>
                <div>
                  <h2>Transcript</h2>
                  <p>Stored only on this device</p>
                </div>
              </div>
              <pre className="call-vault-transcript">{transcript}</pre>

              <details className="call-vault-xray" open>
                <summary>
                  <Lock size={13} /> Privacy X-Ray — what cloud sees when you chat
                </summary>
                <div className="call-vault-xray-body">
                  <TokenVaultPreview input={transcript} onCountChange={setPiiCount} />
                  {piiCount > 0 && (
                    <p className="call-vault-xray-note">
                      {piiCount} identifier{piiCount !== 1 ? "s" : ""} masked —
                      cloud only receives tokens like [PERSON_1], [PHONE_1].
                    </p>
                  )}
                </div>
              </details>

              {transcript.toLowerCase().includes("english translation:") && (
                <div className="call-vault-translate-badge">
                  <Languages size={14} />
                  Non-English speech detected — English translation included.
                </div>
              )}
            </div>
          )}
        </section>

        {transcribed && (
          <section className="assessment-column">
            <div className="card doc-chat">
              <div className="card-title">
                <div className="icon-tile"><MessageSquare size={20} /></div>
                <div>
                  <h2>Chat about this call</h2>
                  <p>Questions PII-masked · Cloud sees tokens only</p>
                </div>
              </div>

              <div className="doc-chat-messages" aria-live="polite">
                {chatMessages.length === 0 && (
                  <div className="doc-chat-empty">
                    <Bot size={20} />
                    <span>
                      Ask anything about the call — "Was this a scam?",
                      "What did they promise?", "Translate what was said."
                    </span>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`doc-chat-bubble ${msg.role}`}>
                    {msg.role === "ai" && (
                      <span className="doc-chat-ai-label">
                        <Lock size={10} /> AI · PII masked
                      </span>
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
                  {[
                    "Was this a scam call?",
                    "What did the caller want?",
                    "Are there red flags?",
                    "Summarise in 3 points",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="call-vault-q-chip"
                      onClick={() => setChatInput(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="doc-chat-input-row">
                <textarea
                  className="doc-chat-textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Ask about this call…"
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

