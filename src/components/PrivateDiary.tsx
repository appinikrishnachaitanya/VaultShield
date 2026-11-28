import {
  ArrowLeft,
  BookHeart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Lock,
  LockKeyhole,
  Mic,
  MicOff,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase/config";
import { t, useAppLanguage, type AppLanguage } from "../lib/i18n";
import { analyzeDiaryEntry, type DiaryAnalysisResult } from "../lib/firebase/ai";
import DayMemoryCard from "./DayMemoryCard";
import {
  changePin,
  deleteEntry,
  getAllEntries,
  getEntryForDate,
  hasPinSet,
  isUnlocked,
  lock as lockDiary,
  resetDiary,
  saveEntry,
  setupPin,
  syncFromFirestore,
  unlockWithPin,
  type DiaryEntry,
  type DiaryMood,
} from "../lib/diaryStore";
import { TokenVaultSession } from "../lib/tokenVault";

type View = "calendar" | "new-entry" | "detail";
type LockView = "checking" | "setup" | "unlock" | "unlocked" | "no-auth";

const MOOD_META: Record<
  DiaryMood,
  { label: string; emoji: string; color: string; bg: string; score: number }
> = {
  joyful: { label: "Joyful", emoji: "😄", color: "#d97706", bg: "#fef3c7", score: 5 },
  calm: { label: "Calm", emoji: "😌", color: "#059669", bg: "#d1fae5", score: 4 },
  neutral: { label: "Neutral", emoji: "😐", color: "#6366f1", bg: "#ede9fe", score: 3 },
  anxious: { label: "Anxious", emoji: "😰", color: "#ea580c", bg: "#ffedd5", score: 2 },
  sad: { label: "Sad", emoji: "😢", color: "#2563eb", bg: "#dbeafe", score: 1 },
};

const LOCALE_MAP: Record<AppLanguage, string> = { en: "en-IN", hi: "hi-IN", fr: "fr-FR" };

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShort(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function dowLabels(locale: string): string[] {
  const base = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  });
}

// ─── PIN lock screens ───────────────────────────────────────────────────────

function PinSetupScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (pin.length < 6) { setError(t("Use at least 6 digits.")); return; }
    if (pin !== confirm) { setError(t("PINs don't match.")); return; }
    setBusy(true);
    try {
      await setupPin(pin);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not set up the PIN."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diary-lock-view">
      <div className="diary-lock-card">
        <Lock size={32} className="diary-lock-icon" />
        <h1>{t("Lock your diary")}</h1>
        <p>{t("Choose a PIN. It encrypts every entry — we never store it, so nobody, not even VaultShield, can read your diary without it.")}</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          className="diary-lock-input"
          placeholder={t("New PIN (min 6 digits)")}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          disabled={busy}
          autoFocus
        />
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          className="diary-lock-input"
          placeholder={t("Confirm PIN")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        {error && <div className="diary-lock-error">{error}</div>}
        <button className="diary-lock-btn" onClick={() => void submit()} disabled={busy}>
          {busy ? t("Setting up…") : t("Lock my diary")}
        </button>
        <div className="diary-lock-warning">
          <ShieldAlert size={13} />
          {t("There is no \"forgot PIN\" recovery — that's what makes this real encryption. Losing the PIN means losing the entries.")}
        </div>
      </div>
    </div>
  );
}

function PinUnlockScreen({ onDone, onNoPinFound }: { onDone: () => void; onNoPinFound: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const outcome = await unlockWithPin(pin);
      if (outcome === "ok") onDone();
      else if (outcome === "not-set-up") onNoPinFound();
      else setError(t("That PIN doesn't match. Try again."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not unlock the diary."));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setBusy(true);
    try {
      await resetDiary();
      onNoPinFound();
    } finally {
      setBusy(false);
    }
  }

  if (confirmingReset) {
    return (
      <div className="diary-lock-view">
        <div className="diary-lock-card">
          <ShieldAlert size={32} className="diary-lock-icon danger" />
          <h1>{t("Erase this diary?")}</h1>
          <p>{t("Forgetting your PIN means the entries can't be decrypted — that's by design. The only way forward is to erase them and start a new, empty diary. This cannot be undone.")}</p>
          <button className="diary-lock-btn danger" onClick={() => void doReset()} disabled={busy}>
            {busy ? t("Erasing…") : t("Erase diary and start over")}
          </button>
          <button className="diary-lock-cancel" onClick={() => setConfirmingReset(false)} disabled={busy}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="diary-lock-view">
      <div className="diary-lock-card">
        <Lock size={32} className="diary-lock-icon" />
        <h1>{t("Diary is locked")}</h1>
        <p>{t("Enter your PIN to continue.")}</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          className="diary-lock-input"
          placeholder={t("PIN")}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          disabled={busy}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        {error && <div className="diary-lock-error">{error}</div>}
        <button className="diary-lock-btn" onClick={() => void submit()} disabled={busy || !pin}>
          {busy ? t("Unlocking…") : t("Unlock")}
        </button>
        <button className="diary-lock-forgot" onClick={() => setConfirmingReset(true)} disabled={busy}>
          {t("Forgot PIN?")}
        </button>
      </div>
    </div>
  );
}

export function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError("");
    if (newPin.length < 6) { setError(t("Use at least 6 digits.")); return; }
    if (newPin !== confirm) { setError(t("New PINs don't match.")); return; }
    setBusy(true);
    try {
      await changePin(oldPin, newPin);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not change the PIN."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diary-modal-overlay" onClick={onClose}>
      <div className="diary-modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2>{t("PIN changed")}</h2>
            <p>{t("Your diary is now protected by the new PIN.")}</p>
            <button className="diary-lock-btn" onClick={onClose}>{t("Done")}</button>
          </>
        ) : (
          <>
            <h2>{t("Change PIN")}</h2>
            <input type="password" inputMode="numeric" pattern="[0-9]*" className="diary-lock-input" placeholder={t("Current PIN")} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} disabled={busy} />
            <input type="password" inputMode="numeric" pattern="[0-9]*" className="diary-lock-input" placeholder={t("New PIN (min 6 digits)")} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} disabled={busy} />
            <input type="password" inputMode="numeric" pattern="[0-9]*" className="diary-lock-input" placeholder={t("Confirm new PIN")} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} disabled={busy} />
            {error && <div className="diary-lock-error">{error}</div>}
            <div className="diary-modal-actions">
              <button className="diary-lock-cancel" onClick={onClose} disabled={busy}>{t("Cancel")}</button>
              <button className="diary-lock-btn" onClick={() => void submit()} disabled={busy}>
                {busy ? t("Saving…") : t("Save new PIN")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function DiaryCalendar({
  entries,
  onNewEntry,
  onOpenEntry,
  onLock,
  onChangePin,
  locale,
}: {
  entries: DiaryEntry[];
  onNewEntry: (date: string) => void;
  onOpenEntry: (entry: DiaryEntry) => void;
  onLock: () => void;
  onChangePin: () => void;
  locale: string;
}) {
  const today = todayStr();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const entryMap = new Map(entries.map((e) => [e.date, e]));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const monthName = new Date(year, month).toLocaleDateString(locale, { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DOW = dowLabels(locale);

  const recentEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const moodCounts = entries.reduce((acc, e) => {
    acc[e.mood] = (acc[e.mood] ?? 0) + 1;
    return acc;
  }, {} as Record<DiaryMood, number>);
  const dominantMood = (Object.keys(moodCounts) as DiaryMood[]).sort(
    (a, b) => (moodCounts[b] ?? 0) - (moodCounts[a] ?? 0),
  )[0];

  return (
    <div className="diary-calendar-view">
      <div className="diary-header">
        <div className="diary-title-row">
          <BookHeart size={28} className="diary-logo" />
          <div>
            <h1>{t("Private Diary")}</h1>
            <p>{t("Your thoughts, locked behind your PIN")}</p>
          </div>
        </div>
        <div className="diary-header-actions">
          <button className="diary-icon-btn" onClick={onChangePin} aria-label={t("Change PIN")} title={t("Change PIN")}>
            <Settings size={18} />
          </button>
          <button className="diary-icon-btn" onClick={onLock} aria-label={t("Lock diary")} title={t("Lock diary")}>
            <Lock size={18} />
          </button>
          <button className="diary-new-btn" onClick={() => onNewEntry(today)} aria-label={t("New entry for today")}>
            <Plus size={18} />
            {t("Today's Entry")}
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="diary-stats-row">
          <div className="diary-stat">
            <span className="diary-stat-num">{entries.length}</span>
            <span className="diary-stat-label">{t("entries")}</span>
          </div>
          {dominantMood && (
            <div className="diary-stat">
              <span className="diary-stat-num">{MOOD_META[dominantMood].emoji}</span>
              <span className="diary-stat-label">{t("mostly")} {t(MOOD_META[dominantMood].label)}</span>
            </div>
          )}
          <div className="diary-stat">
            <span className="diary-stat-num">{new Set(entries.map((e) => e.date.slice(0, 7))).size}</span>
            <span className="diary-stat-label">{t("months")}</span>
          </div>
        </div>
      )}

      <div className="diary-cal">
        <div className="diary-cal-header">
          <button
            className="diary-cal-nav"
            onClick={() => {
              if (month === 0) { setMonth(11); setYear((y) => y - 1); }
              else setMonth((m) => m - 1);
            }}
            aria-label={t("Previous month")}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="diary-cal-month">{monthName}</span>
          <button
            className="diary-cal-nav"
            onClick={() => {
              if (month === 11) { setMonth(0); setYear((y) => y + 1); }
              else setMonth((m) => m + 1);
            }}
            aria-label={t("Next month")}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="diary-cal-grid">
          {DOW.map((d, i) => (
            <div key={i} className="diary-cal-dow">{d}</div>
          ))}
          {cells.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} className="diary-cal-empty" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const entry = entryMap.get(dateStr);
            const isToday = dateStr === today;
            return (
              <button
                key={dateStr}
                className={`diary-cal-day${isToday ? " today" : ""}${entry ? " has-entry" : ""}`}
                onClick={() => (entry ? onOpenEntry(entry) : onNewEntry(dateStr))}
                aria-label={entry ? `${dateStr}: ${t(MOOD_META[entry.mood].label)}` : `${t("New entry for")} ${dateStr}`}
              >
                <span className="diary-cal-num">{day}</span>
                {entry && (
                  <span
                    className="diary-mood-dot"
                    style={{ background: MOOD_META[entry.mood].color }}
                    title={t(MOOD_META[entry.mood].label)}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="diary-mood-legend">
          {(Object.keys(MOOD_META) as DiaryMood[]).map((m) => (
            <span key={m} className="diary-legend-item">
              <span className="diary-legend-dot" style={{ background: MOOD_META[m].color }} />
              {t(MOOD_META[m].label)}
            </span>
          ))}
        </div>
      </div>

      {recentEntries.length > 0 && (
        <div className="diary-recent">
          <div className="diary-section-label">{t("Recent entries")}</div>
          <div className="diary-recent-list">
            {recentEntries.map((e) => (
              <button
                key={e.id}
                className="diary-recent-card"
                style={{ borderLeftColor: MOOD_META[e.mood].color, background: MOOD_META[e.mood].bg }}
                onClick={() => onOpenEntry(e)}
              >
                <div className="diary-recent-top">
                  <span className="diary-recent-date">{formatShort(e.date, locale)}</span>
                  <span className="diary-recent-mood">
                    {MOOD_META[e.mood].emoji} {t(MOOD_META[e.mood].label)}
                  </span>
                </div>
                <p className="diary-recent-summary">{e.summary}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="diary-empty">
          <BookHeart size={40} />
          <strong>{t("Your diary is waiting")}</strong>
          <p>{t("Tap \"Today's Entry\" to write your first reflection. Everything stays encrypted on this device.")}</p>
          <button className="diary-empty-btn" onClick={() => onNewEntry(today)}>
            <Plus size={18} /> {t("Start writing")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── New Entry Form ───────────────────────────────────────────────────────────

type AnalysisStep = { id: string; label: string; status: "pending" | "running" | "done" };

function NewEntry({
  date,
  existing,
  onBack,
  onSaved,
  locale,
  language,
}: {
  date: string;
  existing?: DiaryEntry;
  onBack: () => void;
  onSaved: (entry: DiaryEntry) => void;
  locale: string;
  language: AppLanguage;
}) {
  const [text, setText] = useState(existing?.content ?? "");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [memoryResult, setMemoryResult] = useState<{ result: DiaryAnalysisResult; entry: DiaryEntry } | null>(null);
  const recogRef = useRef<{ stop(): void } | null>(null);
  const vault = useRef(new TokenVaultSession());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  type SpeechRecCtor = new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((ev: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
  };
  const SpeechRec: SpeechRecCtor | undefined =
    (window as typeof window & { SpeechRecognition?: SpeechRecCtor }).SpeechRecognition ??
    (window as typeof window & { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition;
  const hasVoice = Boolean(SpeechRec);

  function startRecording() {
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = locale;
    let finalBuffer = "";
    rec.onresult = (ev) => {
      let fin = "";
      let inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin += t;
        else inter += t;
      }
      finalBuffer += fin;
      setInterim(inter);
      if (fin) {
        const combined = (text.trimEnd() ? text.trimEnd() + " " : "") + finalBuffer;
        setText(combined);
        finalBuffer = "";
      }
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => { setRecording(false); setInterim(""); };
    rec.start();
    recogRef.current = rec;
    setRecording(true);
  }

  function stopRecording() {
    recogRef.current?.stop();
    recogRef.current = null;
    setRecording(false);
    setInterim("");
  }

  function advanceSteps(id: string) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: "running" } : s.status === "running" ? { ...s, status: "done" } : s,
      ),
    );
  }

  async function analyze() {
    if (!text.trim()) { setError(t("Write something first!")); return; }
    setBusy(true);
    setError("");
    vault.current.clear();
    const pipeline: AnalysisStep[] = [
      { id: "vault", label: t("Token vault — mask private details"), status: "pending" },
      { id: "ai", label: t("Hybrid AI — analyze mood & insights"), status: "pending" },
      { id: "save", label: t("Save encrypted to your account"), status: "pending" },
    ];
    setSteps(pipeline);

    try {
      advanceSteps("vault");
      const tokenized = vault.current.tokenize(text);
      await new Promise((r) => setTimeout(r, 400));
      advanceSteps("ai");

      const result = await analyzeDiaryEntry(tokenized.text, vault.current, language);
      advanceSteps("save");

      const entry: DiaryEntry = {
        id: existing?.id ?? `${date}_${Date.now()}`,
        date,
        content: text,
        summary: result.summary,
        mood: result.mood,
        moodScore: result.moodScore,
        actionItems: result.actionItems,
        learnings: result.learnings,
        createdAt: existing?.createdAt ?? Date.now(),
        aiSource: result.source,
      };
      await saveEntry(entry);

      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "done" } : s)));
      await new Promise((r) => setTimeout(r, 500));
      if (result.memories?.length > 0 || result.personalMessage) {
        setMemoryResult({ result, entry });
      } else {
        onSaved(entry);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("Analysis failed.");
      const isAppCheckErr = msg.includes("App Check") || msg.includes("fetch-error") || msg.includes("401");
      setError(
        isAppCheckErr
          ? t("Firebase AI not reachable. Register the App Check debug token in Firebase Console and try again.")
          : msg,
      );
      setSteps([]);
    } finally {
      setBusy(false);
    }
  }

  if (memoryResult) {
    return (
      <DayMemoryCard
        date={date}
        result={memoryResult.result}
        onContinue={() => onSaved(memoryResult.entry)}
        locale={locale}
      />
    );
  }

  return (
    <div className="diary-entry-view">
      <div className="diary-entry-top">
        <button className="diary-back-btn" onClick={onBack} disabled={busy}>
          <ArrowLeft size={18} /> {t("Back")}
        </button>
        <div className="diary-entry-date">
          <span>{formatDate(date, locale)}</span>
        </div>
      </div>

      <div className="diary-entry-card">
        <div className="diary-entry-prompt">
          <BookHeart size={22} />
          <span>{t("How was your day?")}</span>
        </div>

        {hasVoice && (
          <div className="diary-voice-row">
            <button
              className={`diary-voice-btn${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              aria-label={recording ? t("Stop recording") : t("Start voice entry")}
            >
              {recording ? (
                <>
                  <span className="diary-voice-pulse" />
                  <MicOff size={20} />
                  <span>{t("Tap to stop")}</span>
                </>
              ) : (
                <>
                  <Mic size={20} />
                  <span>{t("Speak your mind")}</span>
                </>
              )}
            </button>
            {recording && interim && <span className="diary-interim">"{interim}"</span>}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="diary-textarea"
          value={text + (interim ? " " + interim : "")}
          onChange={(e) => { setText(e.target.value); setInterim(""); }}
          placeholder={t("Write anything — your thoughts, what happened today, how you're feeling…")}
          disabled={busy}
          rows={10}
        />

        <div className="diary-privacy-note">
          <LockKeyhole size={13} />
          <span>{t("Names, numbers & identifiers are masked before AI sees your entry")}</span>
        </div>

        {error && <div className="diary-error">{error}</div>}

        {steps.length > 0 && (
          <div className="diary-pipeline">
            {steps.map((s) => (
              <div key={s.id} className={`diary-step diary-step-${s.status}`}>
                <span className="diary-step-icon">
                  {s.status === "done" ? "✓" : s.status === "running" ? "⟳" : "○"}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        )}

        <button className="diary-analyze-btn" onClick={() => void analyze()} disabled={busy || !text.trim()}>
          <Sparkles size={19} />
          {busy ? t("Analyzing privately…") : t("Analyze & Save Privately")}
        </button>
      </div>
    </div>
  );
}

// ─── Entry Detail ─────────────────────────────────────────────────────────────

function EntryDetail({
  entry,
  onBack,
  onEdit,
  onDeleted,
  locale,
}: {
  entry: DiaryEntry;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  locale: string;
}) {
  const meta = MOOD_META[entry.mood];
  const stars = Array.from({ length: 5 }, (_, i) => i < entry.moodScore);

  function handleDelete() {
    if (confirm(t("Delete this diary entry? This cannot be undone."))) {
      void deleteEntry(entry.id).then(onDeleted);
    }
  }

  return (
    <div className="diary-detail-view">
      <div className="diary-entry-top">
        <button className="diary-back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> {t("Back")}
        </button>
        <div className="diary-detail-actions">
          <button className="diary-edit-btn" onClick={onEdit}>{t("Edit")}</button>
          <button className="diary-delete-btn" onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="diary-detail-mood-banner" style={{ background: meta.bg, borderColor: meta.color }}>
        <span className="diary-detail-emoji">{meta.emoji}</span>
        <div>
          <div className="diary-detail-date">{formatDate(entry.date, locale)}</div>
          <div className="diary-detail-mood-label" style={{ color: meta.color }}>
            {t(meta.label)}
            <span className="diary-mood-stars">
              {stars.map((on, i) => (
                <span key={i} style={{ color: on ? meta.color : "#cbd5e1" }}>★</span>
              ))}
            </span>
          </div>
        </div>
      </div>

      {entry.summary && (
        <div className="diary-detail-section">
          <div className="diary-detail-section-title">
            <Sparkles size={16} />
            {t("AI Summary")}
          </div>
          <p className="diary-detail-summary">{entry.summary}</p>
        </div>
      )}

      <div className="diary-detail-section">
        <div className="diary-detail-section-title">
          <BookHeart size={16} />
          {t("Today's Entry")}
        </div>
        <p className="diary-detail-content">{entry.content}</p>
      </div>

      {entry.actionItems.length > 0 && (
        <div className="diary-detail-section">
          <div className="diary-detail-section-title">
            <Target size={16} />
            {t("Action Items for Tomorrow")}
          </div>
          <ul className="diary-action-list">
            {entry.actionItems.map((item, i) => (
              <li key={i}>
                <CheckCircle2 size={15} style={{ color: meta.color }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.learnings.length > 0 && (
        <div className="diary-detail-section">
          <div className="diary-detail-section-title">
            <Lightbulb size={16} />
            {t("Key Learnings")}
          </div>
          <ul className="diary-learning-list">
            {entry.learnings.map((item, i) => (
              <li key={i}>
                <span className="diary-learning-bullet" style={{ background: meta.color }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`diary-detail-privacy${entry.aiSource === "IN_CLOUD" ? " cloud" : ""}`}>
        <LockKeyhole size={13} />
        {entry.aiSource === "ON_DEVICE"
          ? t("Analyzed on-device — your diary never left this device")
          : t("AI saw only privacy tokens — your real details stayed on this device")}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrivateDiary() {
  const appLanguage = useAppLanguage();
  const locale = LOCALE_MAP[appLanguage];
  const [lockView, setLockView] = useState<LockView>("checking");
  const [view, setView] = useState<View>("calendar");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry | null>(null);
  const [showChangePin, setShowChangePin] = useState(false);

  useEffect(() => {
    if (!auth) { setLockView("no-auth"); return; }
    const unsubscribe = onAuthStateChanged(auth, (current) => {
      if (!current || current.isAnonymous) { setLockView("no-auth"); return; }
      void (async () => {
        try {
          if (isUnlocked()) { setLockView("unlocked"); return; }
          const set = await hasPinSet();
          setLockView(set ? "unlock" : "setup");
        } catch {
          setLockView("no-auth");
        }
      })();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (lockView !== "unlocked") return;
    void getAllEntries().then(setEntries);
    void syncFromFirestore().then(() => getAllEntries().then(setEntries));
  }, [lockView]);

  function openNewEntry(date: string) {
    setSelectedDate(date);
    void getEntryForDate(date).then((e) => setCurrentEntry(e ?? null));
    setView("new-entry");
  }

  function openDetail(entry: DiaryEntry) {
    setCurrentEntry(entry);
    setView("detail");
  }

  function handleSaved(entry: DiaryEntry) {
    void getAllEntries().then(setEntries);
    setCurrentEntry(entry);
    setView("detail");
  }

  function handleDeleted() {
    void getAllEntries().then(setEntries);
    setView("calendar");
  }

  function handleLock() {
    lockDiary();
    setView("calendar");
    setEntries([]);
    setLockView("unlock");
  }

  if (lockView === "checking") return <div className="diary-page" />;
  if (lockView === "no-auth") {
    return (
      <div className="diary-lock-view">
        <div className="diary-lock-card">
          <Lock size={32} className="diary-lock-icon" />
          <h1>{t("Sign in required")}</h1>
          <p>{t("Your Private Diary is tied to your account so it can be encrypted and synced safely. Sign in from the account menu to set up your diary PIN.")}</p>
          <button
            type="button"
            className="diary-lock-btn"
            onClick={() => window.dispatchEvent(new Event("vaultshield-open-account"))}
          >
            {t("Sign in")}
          </button>
        </div>
      </div>
    );
  }
  if (lockView === "setup") return <PinSetupScreen onDone={() => setLockView("unlocked")} />;
  if (lockView === "unlock")
    return (
      <PinUnlockScreen
        onDone={() => setLockView("unlocked")}
        onNoPinFound={() => setLockView("setup")}
      />
    );

  return (
    <div className="diary-page">
      {showChangePin && <ChangePinDialog onClose={() => setShowChangePin(false)} />}
      {view === "calendar" && (
        <DiaryCalendar
          entries={entries}
          onNewEntry={openNewEntry}
          onOpenEntry={openDetail}
          onLock={handleLock}
          onChangePin={() => setShowChangePin(true)}
          locale={locale}
        />
      )}
      {view === "new-entry" && (
        <NewEntry
          date={selectedDate}
          existing={currentEntry ?? undefined}
          onBack={() => setView("calendar")}
          onSaved={handleSaved}
          locale={locale}
          language={appLanguage}
        />
      )}
      {view === "detail" && currentEntry && (
        <EntryDetail
          entry={currentEntry}
          onBack={() => setView("calendar")}
          onEdit={() => setView("new-entry")}
          onDeleted={handleDeleted}
          locale={locale}
        />
      )}
    </div>
  );
}
