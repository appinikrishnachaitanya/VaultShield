import { useSyncExternalStore } from "react";
import hindi from "./hi.json";
export type AppLanguage = "en" | "hi";
const listeners = new Set<() => void>();
let language: AppLanguage = "en";
try {
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("vaultshield-language") === "hi"
  )
    language = "hi";
} catch {
  /* Storage is optional. */
}
export const getLanguage = () => language;
export function setLanguage(next: AppLanguage) {
  if (next !== "en" && next !== "hi") return;
  language = next;
  try {
    localStorage.setItem("vaultshield-language", next);
  } catch {
    /* In-memory preference still works. */
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
export function useAppLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLanguage,
    getLanguage,
  );
}
/** UI copy only. Never pass original messages or evidence through translation. */
export function t(english: string): string {
  if (language !== "hi") return english;
  const download = english.match(/^Downloading local model: (\d+)%$/);
  if (download) return `स्थानीय मॉडल डाउनलोड हो रहा है: ${download[1]}%`;
  const model = english.match(/^Chrome local model: ([a-z]+)\.$/);
  if (model) return `Chrome का स्थानीय मॉडल: ${t(model[1])}।`;
  const translated = (hindi as Record<string, string>)[english.trim()];
  return translated ? english.replace(english.trim(), translated) : english;
}
export function tacticCount(count: number) {
  return language === "hi"
    ? `दबाव डालने के 4 में से ${count} तरीके मिले`
    : `${count} of 4 pressure tactics found`;
}
