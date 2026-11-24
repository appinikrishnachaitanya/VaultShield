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

export function readWithLocalVoice(
  text: string,
  language: FamilyLanguage,
  notify: (message: string) => void,
) {
  const speech = window.speechSynthesis;
  const voice = speech
    ?.getVoices()
    .find(
      (candidate) =>
        candidate.localService &&
        candidate.lang.toLowerCase().split(/[-_]/)[0] === language,
    );
  if (!voice) {
    notify(
      "No installed local voice for this language. The written text is still available.",
    );
    return;
  }
  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.onerror = () =>
    notify(
      "The installed voice could not read this. The written text is still available.",
    );
  notify("");
  speech.speak(utterance);
}
