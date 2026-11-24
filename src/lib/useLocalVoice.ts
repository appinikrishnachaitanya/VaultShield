import { useSyncExternalStore } from "react";
import type { FamilyLanguage } from "./familyGuidance";
import {
  hasLocalVoice,
  subscribeLocalVoices,
  isLocalReading,
  subscribeLocalReading,
} from "./localVoice";

// Voice lists may arrive after the page loads; react to changes without
// downloading language packs or selecting a remote voice.
export function useLocalVoice(language: FamilyLanguage) {
  return useSyncExternalStore(
    subscribeLocalVoices,
    () => hasLocalVoice(language),
    () => false,
  );
}

export function useLocalReading() {
  return useSyncExternalStore(
    subscribeLocalReading,
    isLocalReading,
    () => false,
  );
}
