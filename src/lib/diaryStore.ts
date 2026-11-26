import { auth, db } from "./firebase/config";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";

export type DiaryMood = "joyful" | "calm" | "neutral" | "anxious" | "sad";

export type DiaryEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  summary: string;
  mood: DiaryMood;
  moodScore: number; // 1–5
  actionItems: string[];
  learnings: string[];
  createdAt: number;
};

function uid(): string {
  return auth?.currentUser?.uid ?? "anon";
}
function storageKey(): string {
  return `vs_diary_${uid()}`;
}

export function getAllEntries(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    return JSON.parse(raw) as DiaryEntry[];
  } catch {
    return [];
  }
}

export function getEntryForDate(date: string): DiaryEntry | undefined {
  return getAllEntries().find((e) => e.date === date);
}

export function saveEntry(entry: DiaryEntry): void {
  const all = getAllEntries().filter((e) => e.id !== entry.id);
  all.push(entry);
  all.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(storageKey(), JSON.stringify(all));
  void syncToFirestore(entry);
}

export function deleteEntry(id: string): void {
  const all = getAllEntries().filter((e) => e.id !== id);
  localStorage.setItem(storageKey(), JSON.stringify(all));
  void removeFromFirestore(id);
}

async function syncToFirestore(entry: DiaryEntry): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    const ref = doc(db, `diary/${auth.currentUser.uid}/entries/${entry.id}`);
    await setDoc(ref, entry);
  } catch {
    // offline — data is in localStorage, will sync later
  }
}

async function removeFromFirestore(id: string): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    const ref = doc(db, `diary/${auth.currentUser.uid}/entries/${id}`);
    await deleteDoc(ref);
  } catch {
    // ignore
  }
}

export async function syncFromFirestore(): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    const ref = collection(db, `diary/${auth.currentUser.uid}/entries`);
    const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
    const remote = snap.docs.map((d) => d.data() as DiaryEntry);
    // Merge remote into local — remote wins on conflict
    const local = getAllEntries();
    const merged = new Map<string, DiaryEntry>();
    for (const e of local) merged.set(e.id, e);
    for (const e of remote) merged.set(e.id, e);
    const sorted = Array.from(merged.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    localStorage.setItem(storageKey(), JSON.stringify(sorted));
  } catch {
    // ignore
  }
}
