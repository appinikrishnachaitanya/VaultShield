import { useEffect, useRef, useState } from "react";
import { Check, Copy, PenLine } from "lucide-react";
import {
  optionalLocalSupport,
  proofreadReplyLocally,
  proofreaderAvailability,
  type LocalToolResult,
} from "../lib/firebase/ai";
import type { SanitizedText } from "../types/privacy";
export default function LocalTools({ text }: { text: SanitizedText }) {
  const support = optionalLocalSupport();
  const [proofStatus, setProofStatus] = useState("checking");
  const [corrected, setCorrected] = useState<LocalToolResult>();
  const [draft, setDraft] = useState(
    "I will verify this request through the official contact before taking any action.",
  );
  const [busy, setBusy] = useState<"proof" | "">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void proofreaderAvailability().then((status) => {
      if (alive.current) setProofStatus(status);
    });
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(kind: "proof") {
    setBusy(kind);
    setError("");
    setNotice("");
    setProgress("Preparing local tool…");
    try {
      const report = (message: string) => {
        if (alive.current) setProgress(message);
      };
      const value = await proofreadReplyLocally(draft, report);
      if (alive.current) {
        setCorrected(value);
      }
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error
            ? error.message
            : "Local tool could not complete.",
        );
    } finally {
      if (alive.current) {
        setBusy("");
        setProgress("");
      }
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Reply copied. Review the recipient and send it yourself.");
    } catch {
      setError("Clipboard access failed. Select and copy the reply manually.");
    }
  }
  return (
    <section
      className="optional-tools card"
      aria-label="Optional on-device tools"
    >
      <div className="optional-title">
        <span className="badge local">OPTIONAL · ON-DEVICE</span>
        <h2>A little more clarity. Still private.</h2>
        <p>
          Proofread your own English reply locally. Message summaries are in Maa
          Mode above.
        </p>
      </div>
      <div className="reply-tool-layout">
        <section className="local-tool">
          <h3>
            <PenLine size={20} />
            Prepare your own reply
          </h3>
          <p>
            Polish spelling and grammar in your reply. Suspicious evidence is
            never rewritten.
          </p>
          <label htmlFor="reply-draft">Your reply · English</label>
          <textarea
            id="reply-draft"
            value={draft}
            maxLength={4000}
            disabled={!!busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setCorrected(undefined);
              setNotice("");
            }}
          />
          <div className="tool-actions">
            <button
              className="secondary"
              disabled={
                !!busy ||
                !support.proofreader ||
                !["available", "downloadable", "downloading"].includes(
                  proofStatus,
                ) ||
                !draft.trim()
              }
              onClick={() => void run("proof")}
            >
              Proofread locally
            </button>
            <button
              className="secondary"
              disabled={!!busy || !draft.trim()}
              onClick={() => void copy(draft)}
            >
              <Copy size={16} />
              Copy reply
            </button>
          </div>
          {(!support.proofreader || proofStatus === "unavailable") && (
            <p className="tool-hint">
              Chrome reports that local proofreading is unavailable. Your draft
              is preserved; you can edit and copy it manually. If the model
              crashed, close other AI tabs, restart Chrome, and check
              chrome://on-device-internals before retrying. Nothing is sent to
              the cloud.
            </p>
          )}
          {corrected && (
            <div className="tool-output">
              <span className="badge local">
                ON-DEVICE · {(corrected.durationMs / 1000).toFixed(2)}s
              </span>
              <h4>Suggested correction</h4>
              {corrected.engine && (
                <p className="tool-hint">
                  Chrome Proofreader cancelled; this suggestion used{" "}
                  {corrected.engine} AI.
                </p>
              )}
              <p className="preserve-lines">{corrected.text}</p>
              <p className="tool-hint">
                Check that names, numbers and meaning remain correct before
                accepting.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setDraft(corrected.text);
                  setCorrected(undefined);
                  setNotice("Correction applied to your reply only.");
                }}
              >
                <Check size={16} />
                Use this correction
              </button>
            </div>
          )}
        </section>
      </div>
      <details className="source-details">
        <summary>Compare with the redacted message</summary>
        <p className="preserve-lines">{text}</p>
      </details>
      {busy && (
        <p role="status" className="local-progress">
          {progress} Local models may take a minute or more on CPU, especially
          after a specialist fails. Your reply stays on this device.
        </p>
      )}
      {error && (
        <p role="alert" className="tool-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="tool-hint">
          {notice}
        </p>
      )}
    </section>
  );
}
