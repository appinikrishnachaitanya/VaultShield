import { useState } from "react";
import { Users, Cpu, Cloud, ChevronDown, ChevronUp } from "lucide-react";
import { generateFamilyExplanation } from "../lib/firebase/ai";
import { t, useAppLanguage } from "../lib/i18n";
import type { LocalResult } from "../types/privacy";

type Props = {
  result: LocalResult;
  disabled?: boolean;
};

export default function ExplainForFamily({ result, disabled }: Props) {
  const language = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [source, setSource] = useState<"ON_DEVICE" | "IN_CLOUD" | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const foundStages = result.stages.filter((s) => s.found);
  if (foundStages.length === 0) return null;

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const tacticNames = foundStages.map((s) => s.name);
      const res = await generateFamilyExplanation(
        tacticNames,
        foundStages.length,
        language as "en" | "hi",
      );
      setExplanation(res.text);
      setSource(res.source);
      setOpen(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not generate explanation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="explain-family">
      <div className="explain-header">
        <div className="explain-icon">
          <Users size={18} />
        </div>
        <div>
          <strong>{t("Explain to a family member")}</strong>
          <p>
            {t(
              "Generate a simple explanation anyone can understand — no jargon, no personal details.",
            )}
          </p>
        </div>
        {explanation ? (
          <button
            type="button"
            className="explain-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : (
          <button
            type="button"
            className="explain-btn"
            disabled={disabled || busy}
            onClick={() => void generate()}
          >
            {busy ? t("Writing…") : t("Explain simply")}
          </button>
        )}
      </div>

      {error && <p className="explain-error">{error}</p>}

      {explanation && open && (
        <div className="explain-result">
          <div className="explain-source">
            {source === "ON_DEVICE" ? (
              <>
                <Cpu size={12} />
                {t("Generated on this device")}
              </>
            ) : (
              <>
                <Cloud size={12} />
                {t("Generated via cloud (no personal data sent)")}
              </>
            )}
          </div>
          <p className="explain-text">{explanation}</p>
          <button
            type="button"
            className="explain-regen"
            disabled={disabled || busy}
            onClick={() => void generate()}
          >
            {busy ? t("Writing…") : t("Regenerate")}
          </button>
        </div>
      )}
    </div>
  );
}
