import { useSyncExternalStore } from "react";
import hindi from "./hi.json";
import french from "./fr.json";
export type AppLanguage = "en" | "hi" | "fr";
export const APP_LANGUAGES: { code: AppLanguage; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "fr", label: "French", nativeLabel: "Français" },
];
const dictionaries: Partial<Record<AppLanguage, Record<string, string>>> = {
  hi: hindi as Record<string, string>,
  fr: french as Record<string, string>,
};
function isAppLanguage(value: string): value is AppLanguage {
  return APP_LANGUAGES.some((entry) => entry.code === value);
}
const listeners = new Set<() => void>();
let language: AppLanguage = "en";
try {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("vaultshield-language");
    if (stored && isAppLanguage(stored)) language = stored;
  }
} catch {
  /* Storage is optional. */
}
export const getLanguage = () => language;
export function setLanguage(next: AppLanguage) {
  if (!isAppLanguage(next)) return;
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
const DOWNLOAD_TEMPLATES: Partial<Record<AppLanguage, (percent: string) => string>> = {
  hi: (percent) => `स्थानीय मॉडल डाउनलोड हो रहा है: ${percent}%`,
  fr: (percent) => `Téléchargement du modèle local : ${percent} %`,
};
const CHROME_MODEL_TEMPLATES: Partial<Record<AppLanguage, (status: string) => string>> = {
  hi: (status) => `Chrome का स्थानीय मॉडल: ${status}।`,
  fr: (status) => `Modèle local Chrome : ${status}.`,
};

/** UI copy only. Never pass original messages or evidence through translation. */
export function t(english: string): string {
  const dictionary = dictionaries[language];
  if (!dictionary) return english;
  const download = english.match(/^Downloading local model: (\d+)%$/);
  if (download) return DOWNLOAD_TEMPLATES[language]?.(download[1]) ?? english;
  const model = english.match(/^Chrome local model: ([a-z]+)\.$/);
  if (model) return CHROME_MODEL_TEMPLATES[language]?.(t(model[1])) ?? english;
  const translated = dictionary[english.trim()];
  return translated ? english.replace(english.trim(), translated) : english;
}
export function tacticCount(count: number) {
  if (language === "hi") return `दबाव डालने के 4 में से ${count} तरीके मिले`;
  if (language === "fr") return `${count} tactique(s) de pression sur 4 détectée(s)`;
  return `${count} of 4 pressure tactics found`;
}
