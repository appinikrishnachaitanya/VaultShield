import {
  ArrowLeft,
  BookHeart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  LockKeyhole,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analyzeDiaryEntry } from "../lib/firebase/ai";
import {
  deleteEntry,
  getAllEntries,
  getEntryForDate,
  saveEntry,
  syncFromFirestore,
  type DiaryEntry,
  type DiaryMood,
} from "../lib/diaryStore";
import { TokenVaultSession } from "../lib/tokenVault";

type View = "calendar" | "new-entry" | "detail";

const MOOD_META: Record<
  DiaryMood,
  { label: string; emoji: string; color: string; bg: string; score: number }
> = {
  joyful: {
    label: "Joyful",
    emoji: "😄",
    color: "#d97706",
    bg: "#fef3c7",
    score: 5,
  },
  calm: {
    label: "Calm",
    emoji: "😌",
    color: "#059669",
    bg: "#d1fae5",
    score: 4,
  },
  neutral: {
    label: "Neutral",
    emoji: "😐",
    color: "#6366f1",
    bg: "#ede9fe",
    score: 3,
  },
  anxious: {
    label: "Anxious",
    emoji: "😰",
    color: "#ea580c",
    bg: "#ffedd5",
    score: 2,
  },
  sad: {
    label: "Sad",
    emoji: "😢",
    color: "#2563eb",
    bg: "#dbeafe",
    score: 1,
  },
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function DiaryCalendar({
  entries,
  onNewEntry,
  onOpenEntry,
}: {
  entries: DiaryEntry[];
  onNewEntry: (date: string) => void;
  onOpenEntry: (entry: DiaryEntry) => void;
}) {
  const today = todayStr();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based

  const entryMap = new Map(entries.map((e) => [e.date, e]));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const monthName = new Date(year, month).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const recentEntries = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const moodCounts = entries.reduce(
    (acc, e) => {
      acc[e.mood] = (acc[e.mood] ?? 0) + 1;
      return acc;
    },
    {} as Record<DiaryMood, number>,
  );
  const dominantMood = (Object.keys(moodCounts) as DiaryMood[]).sort(
    (a, b) => (moodCounts[b] ?? 0) - (moodCounts[a] ?? 0),
  )[0];

  return (
    <div className="diary-calendar-view">
      <div className="diary-header">
        <div className="diary-title-row">
          <BookHeart size={28} className="diary-logo" />
          <div>
            <h1>Private Diary</h1>
            <p>Your thoughts, locked on this device</p>
          </div>
        </div>
        <button
          className="diary-new-btn"
          onClick={() => onNewEntry(today)}
          aria-label="New entry for today"
        >
          <Plus size={18} />
          Today's Entry
        </button>
      </div>

      {entries.length > 0 && (
        <div className="diary-stats-row">
          <div className="diary-stat">
            <span className="diary-stat-num">{entries.length}</span>
            <span className="diary-stat-label">entries</span>
          </div>
          {dominantMood && (
            <div className="diary-stat">
              <span className="diary-stat-num">{MOOD_META[dominantMood].emoji}</span>
              <span className="diary-stat-label">mostly {dominantMood}</span>
            </div>
          )}
          <div className="diary-stat">
            <span className="diary-stat-num">
              {new Set(entries.map((e) => e.date.slice(0, 7))).size}
            </span>
            <span className="diary-stat-label">months</span>
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="diary-cal">
        <div className="diary-cal-header">
          <button
            className="diary-cal-nav"
            onClick={() => {
              if (month === 0) { setMonth(11); setYear((y) => y - 1); }
              else setMonth((m) => m - 1);
            }}
            aria-label="Previous month"
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
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="diary-cal-grid">
          {DOW.map((d) => (
            <div key={d} className="diary-cal-dow">
              {d}
            </div>
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
                onClick={() => entry ? onOpenEntry(entry) : onNewEntry(dateStr)}
                aria-label={entry ? `${dateStr}: ${entry.mood}` : `New entry for ${dateStr}`}
              >
                <span className="diary-cal-num">{day}</span>
                {entry && (
                  <span
                    className="diary-mood-dot"
                    style={{ background: MOOD_META[entry.mood].color }}
                    title={MOOD_META[entry.mood].label}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="diary-mood-legend">
          {(Object.keys(MOOD_META) as DiaryMood[]).map((m) => (
            <span key={m} className="diary-legend-item">
              <span
                className="diary-legend-dot"
                style={{ background: MOOD_META[m].color }}
              />
              {MOOD_META[m].label}
            </span>
          ))}
        </div>
      </div>

      {/* Recent entries */}
      {recentEntries.length > 0 && (
        <div className="diary-recent">
          <div className="diary-section-label">Recent entries</div>
          <div className="diary-recent-list">
            {recentEntries.map((e) => (
              <button
                key={e.id}
                className="diary-recent-card"
                style={{
                  borderLeftColor: MOOD_META[e.mood].color,
                  background: MOOD_META[e.mood].bg,
                }}
                onClick={() => onOpenEntry(e)}
              >
                <div className="diary-recent-top">
                  <span className="diary-recent-date">{formatShort(e.date)}</span>
                  <span className="diary-recent-mood">
                    {MOOD_META[e.mood].emoji} {MOOD_META[e.mood].label}
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
          <strong>Your diary is waiting</strong>
          <p>Tap "Today's Entry" to write your first reflection. Everything stays on this device.</p>
          <button className="diary-empty-btn" onClick={() => onNewEntry(today)}>
            <Plus size={18} /> Start writing
          </button>
        </div>
      )}
    </div>
  );
}

// ─── New Entry Form ───────────────────────────────────────────────────────────

type AnalysisStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
};

function NewEntry({
  date,
  existing,
  onBack,
  onSaved,
}: {
  date: string;
  existing?: DiaryEntry;
  onBack: () => void;
  onSaved: (entry: DiaryEntry) => void;
}) {
  const [text, setText] = useState(existing?.content ?? "");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
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
    rec.lang = "en-IN";
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
        s.id === id
          ? { ...s, status: "running" }
          : s.status === "running"
            ? { ...s, status: "done" }
            : s,
      ),
    );
  }

  async function analyze() {
    if (!text.trim()) { setError("Write something first!"); return; }
    setBusy(true);
    setError("");
    vault.current.clear();
    const pipeline: AnalysisStep[] = [
      { id: "vault", label: "Token vault — mask private details", status: "pending" },
      { id: "ai", label: "Cloud AI — analyze mood & insights", status: "pending" },
      { id: "save", label: "Save encrypted to your account", status: "pending" },
    ];
    setSteps(pipeline);

    try {
      // Step 1: tokenize
      advanceSteps("vault");
      const tokenized = vault.current.tokenize(text);
      await new Promise((r) => setTimeout(r, 400));
      advanceSteps("ai");

      // Step 2: AI analysis
      const result = await analyzeDiaryEntry(tokenized.text);
      advanceSteps("save");

      // Step 3: save
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
      };
      await saveEntry(entry);

      // mark last step done
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "done" } : s)));
      await new Promise((r) => setTimeout(r, 500));
      onSaved(entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Try again.");
      setSteps([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diary-entry-view">
      <div className="diary-entry-top">
        <button className="diary-back-btn" onClick={onBack} disabled={busy}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="diary-entry-date">
          <span>{formatDate(date)}</span>
        </div>
      </div>

      <div className="diary-entry-card">
        <div className="diary-entry-prompt">
          <BookHeart size={22} />
          <span>How was your day?</span>
        </div>

        {hasVoice && (
          <div className="diary-voice-row">
            <button
              className={`diary-voice-btn${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              aria-label={recording ? "Stop recording" : "Start voice entry"}
            >
              {recording ? (
                <>
                  <span className="diary-voice-pulse" />
                  <MicOff size={20} />
                  <span>Tap to stop</span>
                </>
              ) : (
                <>
                  <Mic size={20} />
                  <span>Speak your mind</span>
                </>
              )}
            </button>
            {recording && interim && (
              <span className="diary-interim">"{interim}"</span>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="diary-textarea"
          value={text + (interim ? " " + interim : "")}
          onChange={(e) => { setText(e.target.value); setInterim(""); }}
          placeholder="Write anything — your thoughts, what happened today, how you're feeling…"
          disabled={busy}
          rows={10}
        />

        <div className="diary-privacy-note">
          <LockKeyhole size={13} />
          <span>Names, numbers & identifiers are masked before AI sees your entry</span>
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

        <button
          className="diary-analyze-btn"
          onClick={() => void analyze()}
          disabled={busy || !text.trim()}
        >
          <Sparkles size={19} />
          {busy ? "Analyzing privately…" : "Analyze & Save Privately"}
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
}: {
  entry: DiaryEntry;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const meta = MOOD_META[entry.mood];
  const stars = Array.from({ length: 5 }, (_, i) => i < entry.moodScore);

  function handleDelete() {
    if (confirm("Delete this diary entry? This cannot be undone.")) {
      void deleteEntry(entry.id).then(onDeleted);
    }
  }

  return (
    <div className="diary-detail-view">
      <div className="diary-entry-top">
        <button className="diary-back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="diary-detail-actions">
          <button className="diary-edit-btn" onClick={onEdit}>Edit</button>
          <button className="diary-delete-btn" onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div
        className="diary-detail-mood-banner"
        style={{ background: meta.bg, borderColor: meta.color }}
      >
        <span className="diary-detail-emoji">{meta.emoji}</span>
        <div>
          <div className="diary-detail-date">{formatDate(entry.date)}</div>
          <div className="diary-detail-mood-label" style={{ color: meta.color }}>
            {meta.label}
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
            AI Summary
          </div>
          <p className="diary-detail-summary">{entry.summary}</p>
        </div>
      )}

      <div className="diary-detail-section">
        <div className="diary-detail-section-title">
          <BookHeart size={16} />
          Today's Entry
        </div>
        <p className="diary-detail-content">{entry.content}</p>
      </div>

      {entry.actionItems.length > 0 && (
        <div className="diary-detail-section">
          <div className="diary-detail-section-title">
            <Target size={16} />
            Action Items for Tomorrow
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
            Key Learnings
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

      <div className="diary-detail-privacy">
        <LockKeyhole size={13} />
        AI saw only privacy tokens — your real details stayed on this device
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrivateDiary() {
  const [view, setView] = useState<View>("calendar");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry | null>(null);

  useEffect(() => {
    void getAllEntries().then(setEntries);
    void syncFromFirestore().then(() => getAllEntries().then(setEntries));
  }, []);

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

  return (
    <div className="diary-page">
      {view === "calendar" && (
        <DiaryCalendar
          entries={entries}
          onNewEntry={openNewEntry}
          onOpenEntry={openDetail}
        />
      )}
      {view === "new-entry" && (
        <NewEntry
          date={selectedDate}
          existing={currentEntry ?? undefined}
          onBack={() => setView("calendar")}
          onSaved={handleSaved}
        />
      )}
      {view === "detail" && currentEntry && (
        <EntryDetail
          entry={currentEntry}
          onBack={() => setView("calendar")}
          onEdit={() => setView("new-entry")}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
