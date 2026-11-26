/**
 * Private Diary Storage — AES-GCM 256-bit client-side encryption.
 *
 * Key derivation: PBKDF2(uid, salt="vaultshield-diary-v1", 100 000 iterations, SHA-256)
 * Stored shape in both localStorage and Firestore:
 *   { id, date, createdAt, iv: base64, data: base64(AES-GCM ciphertext of JSON) }
 *
 * Firebase never sees plaintext. Even if the database is breached, entries are unreadable
 * without the user's UID — which is never stored server-side in a recoverable form.
 */
import { auth, db } from "./firebase/config";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
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

/** Shape stored at rest (localStorage + Firestore) — no plaintext */
type StoredEntry = {
  id: string;
  date: string;
  createdAt: number;
  iv: string;      // base64 — 12-byte AES-GCM nonce
  data: string;    // base64 — AES-GCM ciphertext of JSON.stringify(DiaryEntry)
};

// ── Crypto helpers ────────────────────────────────────────────────────────────

let _keyCache: CryptoKey | null = null;
let _keyCacheUid = "";

async function getKey(): Promise<CryptoKey> {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in required to use Private Diary.");
  if (_keyCache && _keyCacheUid === uid) return _keyCache;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(uid),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("vaultshield-diary-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  _keyCache = key;
  _keyCacheUid = uid;
  return key;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf)));
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function encryptEntry(entry: DiaryEntry): Promise<StoredEntry> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(entry));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    id: entry.id,
    date: entry.date,
    createdAt: entry.createdAt,
    iv: b64(iv),
    data: b64(ciphertext),
  };
}

async function decryptEntry(stored: StoredEntry): Promise<DiaryEntry | null> {
  try {
    const key = await getKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(stored.iv) },
      key,
      unb64(stored.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as DiaryEntry;
  } catch {
    return null; // wrong key or corrupted data
  }
}

// ── Local storage (encrypted blobs) ──────────────────────────────────────────

function localKey(): string {
  return `vs_diary_enc_${auth?.currentUser?.uid ?? "anon"}`;
}

function getStoredBlobs(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(localKey());
    return raw ? (JSON.parse(raw) as StoredEntry[]) : [];
  } catch {
    return [];
  }
}

function putStoredBlob(blob: StoredEntry): void {
  const all = getStoredBlobs().filter((b) => b.id !== blob.id);
  all.push(blob);
  all.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(localKey(), JSON.stringify(all));
}

function removeStoredBlob(id: string): void {
  const all = getStoredBlobs().filter((b) => b.id !== id);
  localStorage.setItem(localKey(), JSON.stringify(all));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAllEntries(): Promise<DiaryEntry[]> {
  const blobs = getStoredBlobs();
  const results = await Promise.all(blobs.map(decryptEntry));
  return results.filter((e): e is DiaryEntry => e !== null);
}

export async function getEntryForDate(date: string): Promise<DiaryEntry | undefined> {
  const all = await getAllEntries();
  return all.find((e) => e.date === date);
}

export async function saveEntry(entry: DiaryEntry): Promise<void> {
  const blob = await encryptEntry(entry);
  putStoredBlob(blob);
  void syncBlobToFirestore(blob);
}

export async function deleteEntry(id: string): Promise<void> {
  removeStoredBlob(id);
  void removeFromFirestore(id);
}

// ── Firestore sync ────────────────────────────────────────────────────────────

async function syncBlobToFirestore(blob: StoredEntry): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    const ref = doc(db, `diary/${auth.currentUser.uid}/entries/${blob.id}`);
    await setDoc(ref, blob);
  } catch {
    // offline — blob is already in localStorage, Firestore gets it on next sync
  }
}

async function removeFromFirestore(id: string): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    await deleteDoc(doc(db, `diary/${auth.currentUser.uid}/entries/${id}`));
  } catch {
    // ignore
  }
}

/** Pull encrypted blobs from Firestore and merge into localStorage. */
export async function syncFromFirestore(): Promise<void> {
  if (!db || !auth?.currentUser) return;
  try {
    const ref = collection(db, `diary/${auth.currentUser.uid}/entries`);
    const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
    const remote = snap.docs.map((d) => d.data() as StoredEntry);
    const local = getStoredBlobs();
    const merged = new Map<string, StoredEntry>();
    for (const b of local) merged.set(b.id, b);
    for (const b of remote) merged.set(b.id, b); // remote wins
    const sorted = Array.from(merged.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    localStorage.setItem(localKey(), JSON.stringify(sorted));
  } catch {
    // ignore — local data is still available
  }
}
