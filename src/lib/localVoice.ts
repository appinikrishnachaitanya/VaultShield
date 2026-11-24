import type { FamilyLanguage } from "./familyGuidance";

export function hasLocalVoice(language: FamilyLanguage): boolean {
  return (
    typeof window !== "undefined" &&
    typeof SpeechSynthesisUtterance !== "undefined" &&
    Boolean(
      window.speechSynthesis
        ?.getVoices()
        .some(
          (voice) =>
            voice.localService &&
            voice.lang.toLowerCase().split(/[-_]/)[0] === language,
        ),
    )
  );
}

export function subscribeLocalVoices(refresh: () => void): () => void {
  const speech =
    typeof window === "undefined" ? undefined : window.speechSynthesis;
  speech?.addEventListener("voiceschanged", refresh);
  return () => speech?.removeEventListener("voiceschanged", refresh);
}

let activeUtterance: SpeechSynthesisUtterance | undefined;
const readingListeners = new Set<() => void>();
const publishReading = () => readingListeners.forEach((listener) => listener());
export const isLocalReading = () => activeUtterance !== undefined;
export function subscribeLocalReading(listener: () => void) {
  readingListeners.add(listener);
  return () => {
    readingListeners.delete(listener);
  };
}
export function stopLocalReading() {
  // Clear first: browsers may dispatch cancellation events synchronously.
  activeUtterance = undefined;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  publishReading();
}

export function readWithLocalVoice(
  text: string,
  language: FamilyLanguage,
  notify: (message: string) => void,
) {
  const speech =
    typeof window === "undefined" ? undefined : window.speechSynthesis;
  const voice = speech
    ?.getVoices()
    .find(
      (candidate) =>
        candidate.localService &&
        candidate.lang.toLowerCase().split(/[-_]/)[0] === language,
    );
  if (!voice || !speech || typeof SpeechSynthesisUtterance === "undefined") {
    notify(
      "No installed local voice for this language. The written text is still available.",
    );
    return;
  }
  stopLocalReading();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.onend = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = undefined;
    publishReading();
  };
  utterance.onerror = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = undefined;
    publishReading();
    notify(
      "The installed voice could not read this. The written text is still available.",
    );
  };
  notify("");
  activeUtterance = utterance;
  publishReading();
  try {
    speech.speak(utterance);
  } catch {
    utterance.onerror?.(new Event("error") as SpeechSynthesisErrorEvent);
  }
}
