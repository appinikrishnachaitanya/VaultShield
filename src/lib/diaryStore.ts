/**
 * Private Diary Storage — AES-GCM 256-bit client-side encryption, keyed by a
 * user-chosen PIN.
 *
 * The encryption key is derived from the PIN via PBKDF2 with a random
 * per-user salt (stored, not secret — a salt only needs to be unique, not
 * hidden). Firebase stores only the salt and the encrypted entry blobs: it
 * never sees the PIN, the derived key, or plaintext entry content. Unlike an
 * identity-derived key (e.g. from the Firebase UID), the PIN is never stored
 * anywhere in recoverable form, so this is real protection against anyone
 * with read access to the database — including VaultShield's own backend.
 *
 * Tradeoff: if the PIN is forgotten, entries are cryptographically
 * unrecoverable by design. The only recovery path is resetDiary(), which
 * wipes everything and starts fresh.
 */
import { auth, db } from "./firebase/config";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  moodScore: number; // 1-5
  actionItems: string[];
  learnings: string[];
  createdAt: number;
  aiSource?: "ON_DEVICE" | "IN_CLOUD";
};

/** Shape stored at rest (localStorage + Firestore) — fully opaque, no plaintext content. */
type StoredEntry = {
  id: string;
  date: string;
  createdAt: number;
  iv: string; // base64 — 12-byte AES-GCM nonce
  data: string; // base64 — AES-GCM ciphertext of JSON.stringify(DiaryEntry)
};

/** PIN lock configuration — the salt is not secret, only unique. */
type LockConfig = {
  salt: string; // base64 — 16 random bytes
  canaryIv: string; // base64
  canaryData: string; // base64 — AES-GCM ciphertext of a known constant
};

const CANARY_PLAINTEXT = "vaultshield-diary-pin-check-v1";
const PBKDF2_ITERATIONS = 300_000;

// ── Encoding helpers ─────────────────────────────────────────────────────────

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// ── In-memory session state ──────────────────────────────────────────────────
// The derived key lives only in JS memory for this tab's lifetime. It is
// never persisted anywhere, so locking is automatic on reload/close.

let _sessionKey: CryptoKey | null = null;
let _sessionUid = "";

function localConfigKey(uid: string): string {
  return `vs_diary_lock_${uid}`;
}
function localEntriesKey(uid: string): string {
  return `vs_diary_enc_${uid}`;
}

function currentUid(): string {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Sign in required to use Private Diary.");
  return uid;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Lock configuration (salt + canary) — local-first, synced to Firestore ───

async function readLockConfig(uid: string): Promise<LockConfig | null> {
  try {
    const raw = localStorage.getItem(localConfigKey(uid));
    if (raw) return JSON.parse(raw) as LockConfig;
  } catch {
    /* fall through to Firestore */
  }
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid, "settings", "diaryLock"));
    if (!snap.exists()) return null;
    const cfg = snap.data() as LockConfig;
    localStorage.setItem(localConfigKey(uid), JSON.stringify(cfg));
    return cfg;
  } catch {
    return null;
  }
}

async function writeLockConfig(uid: string, cfg: LockConfig): Promise<void> {
  localStorage.setItem(localConfigKey(uid), JSON.stringify(cfg));
  if (!db) return;
  try {
    await setDoc(doc(db, "users", uid, "settings", "diaryLock"), cfg);
  } catch {
    // offline — local copy is authoritative until the next successful sync
  }
}

/** Whether this account has ever set up a diary PIN. */
export async function hasPinSet(): Promise<boolean> {
  const uid = currentUid();
  return (await readLockConfig(uid)) !== null;
}

/** Whether the diary is currently unlocked in this tab. */
export function isUnlocked(): boolean {
  return _sessionKey !== null && _sessionUid === (auth?.currentUser?.uid ?? "");
}

/** Lock the diary immediately — clears the in-memory key only, no data is touched. */
export function lock(): void {
  _sessionKey = null;
  _sessionUid = "";
}

/** First-time setup: choose a PIN and create the lock configuration. */
export async function setupPin(pin: string): Promise<void> {
  if (pin.length < 6) throw new Error("Use at least 6 characters for real protection.");
  const uid = currentUid();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const canaryData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(CANARY_PLAINTEXT),
  );
  await writeLockConfig(uid, {
    salt: b64(salt),
    canaryIv: b64(iv),
    canaryData: b64(canaryData),
  });
  _sessionKey = key;
  _sessionUid = uid;
}

/** Attempt to unlock with a PIN. Returns false on a wrong PIN rather than throwing. */
export async function unlockWithPin(pin: string): Promise<boolean> {
  const uid = currentUid();
  const cfg = await readLockConfig(uid);
  if (!cfg) throw new Error("No diary PIN has been set up yet.");
  const key = await deriveKey(pin, unb64(cfg.salt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(cfg.canaryIv) },
      key,
      unb64(cfg.canaryData),
    );
    if (new TextDecoder().decode(plaintext) !== CANARY_PLAINTEXT) return false;
  } catch {
    return false; // AES-GCM auth tag rejected — wrong PIN
  }
  _sessionKey = key;
  _sessionUid = uid;
  return true;
}

/** Change the PIN: re-encrypts every entry with a freshly derived key. */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  if (newPin.length < 6) throw new Error("Use at least 6 characters for real protection.");
  const ok = await unlockWithPin(oldPin);
  if (!ok) throw new Error("Current PIN is incorrect.");
  const uid = currentUid();
  const entries = await getAllEntries();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const newKey = await deriveKey(newPin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const canaryData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    newKey,
    new TextEncoder().encode(CANARY_PLAINTEXT),
  );
  _sessionKey = newKey;
  _sessionUid = uid;
  for (const entry of entries) await saveEntry(entry);
  await writeLockConfig(uid, { salt: b64(salt), canaryIv: b64(iv), canaryData: b64(canaryData) });
}

/**
 * Forgot-PIN recovery: permanently deletes every entry and the lock
 * configuration, both locally and in Firestore. There is no other way to
 * recover a diary whose PIN has been forgotten — the data is encrypted with
 * a key nobody, including VaultShield, can reconstruct without it.
 */
export async function resetDiary(): Promise<void> {
  const uid = currentUid();
  localStorage.removeItem(localConfigKey(uid));
  localStorage.removeItem(localEntriesKey(uid));
  lock();
  if (!db) return;
  try {
    await deleteDoc(doc(db, "users", uid, "settings", "diaryLock"));
    const ref = collection(db, "diary", uid, "entries");
    const snap = await getDocs(ref);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch {
    // local wipe already happened; Firestore cleanup can lag if offline
  }
}

// ── Entry encryption ──────────────────────────────────────────────────────────

function requireUnlocked(): CryptoKey {
  if (!_sessionKey || _sessionUid !== (auth?.currentUser?.uid ?? "")) {
    throw new Error("Diary is locked. Enter your PIN to continue.");
  }
  return _sessionKey;
}

async function encryptEntry(entry: DiaryEntry): Promise<StoredEntry> {
  const key = requireUnlocked();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(entry));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { id: entry.id, date: entry.date, createdAt: entry.createdAt, iv: b64(iv), data: b64(ciphertext) };
}

async function decryptEntry(stored: StoredEntry): Promise<DiaryEntry | null> {
  try {
    const key = requireUnlocked();
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

function getStoredBlobs(uid: string): StoredEntry[] {
  try {
    const raw = localStorage.getItem(localEntriesKey(uid));
    return raw ? (JSON.parse(raw) as StoredEntry[]) : [];
  } catch {
    return [];
  }
}
function putStoredBlob(uid: string, blob: StoredEntry): void {
  const all = getStoredBlobs(uid).filter((b) => b.id !== blob.id);
  all.push(blob);
  all.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(localEntriesKey(uid), JSON.stringify(all));
}
function removeStoredBlob(uid: string, id: string): void {
  localStorage.setItem(
    localEntriesKey(uid),
    JSON.stringify(getStoredBlobs(uid).filter((b) => b.id !== id)),
  );
}

// ── Public entry API ──────────────────────────────────────────────────────────

export async function getAllEntries(): Promise<DiaryEntry[]> {
  const uid = currentUid();
  const results = await Promise.all(getStoredBlobs(uid).map(decryptEntry));
  return results.filter((e): e is DiaryEntry => e !== null);
}

export async function getEntryForDate(date: string): Promise<DiaryEntry | undefined> {
  const all = await getAllEntries();
  return all.find((e) => e.date === date);
}

export async function saveEntry(entry: DiaryEntry): Promise<void> {
  const uid = currentUid();
  const blob = await encryptEntry(entry);
  putStoredBlob(uid, blob);
  void syncBlobToFirestore(uid, blob);
}

export async function deleteEntry(id: string): Promise<void> {
  const uid = currentUid();
  removeStoredBlob(uid, id);
  void removeFromFirestore(uid, id);
}

// ── Firestore sync ────────────────────────────────────────────────────────────

async function syncBlobToFirestore(uid: string, blob: StoredEntry): Promise<void> {
  if (!db) return;
  try {
    await setDoc(doc(db, "diary", uid, "entries", blob.id), blob);
  } catch {
    // offline — blob is already in localStorage, Firestore gets it on next sync
  }
}

async function removeFromFirestore(uid: string, id: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, "diary", uid, "entries", id));
  } catch {
    // ignore
  }
}

/** Pull encrypted blobs from Firestore and merge into localStorage (remote wins). */
export async function syncFromFirestore(): Promise<void> {
  const uid = currentUid();
  if (!db) return;
  try {
    const ref = collection(db, "diary", uid, "entries");
    const snap = await getDocs(query(ref, orderBy("createdAt", "asc")));
    const remote = snap.docs.map((d) => d.data() as StoredEntry);
    const merged = new Map<string, StoredEntry>();
    for (const b of getStoredBlobs(uid)) merged.set(b.id, b);
    for (const b of remote) merged.set(b.id, b);
    const sorted = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(localEntriesKey(uid), JSON.stringify(sorted));
  } catch {
    // ignore — local data is still available
  }
}
