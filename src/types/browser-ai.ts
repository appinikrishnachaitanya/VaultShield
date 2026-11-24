export type Availability =
  "available" | "downloadable" | "downloading" | "unavailable";
export type LocalToolOptions = {
  type?: "key-points";
  format?: "plain-text";
  length?: "medium";
  expectedInputLanguages?: string[];
  expectedContextLanguages?: string[];
  outputLanguage?: string;
  sharedContext?: string;
  signal?: AbortSignal;
  monitor?: (monitor: {
    addEventListener(
      type: "downloadprogress",
      listener: (event: { loaded: number }) => void,
    ): void;
  }) => void;
};
export interface SummarySession {
  summarize(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}
export interface ProofSession {
  proofread(
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ correctedInput: string }>;
  destroy(): void;
}
export interface LocalFactory<T> {
  availability(options: LocalToolOptions): Promise<Availability>;
  create(options: LocalToolOptions): Promise<T>;
}
export type SpeechOptions = { langs: string[]; processLocally: true };
export interface LocalRecognition {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          [index: number]: { transcript: string };
        }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface SpeechFactory {
  new (): LocalRecognition;
  prototype: LocalRecognition;
  available(options: SpeechOptions): Promise<Availability>;
  install(options: SpeechOptions): Promise<boolean>;
}
export interface WriterSession {
  write(prompt: string): Promise<string>;
  destroy(): void;
}

type TranslationLanguages = { sourceLanguage: string; targetLanguage: string };
export interface TranslatorFactory {
  availability(options: TranslationLanguages): Promise<Availability>;
  create(options: TranslationLanguages & LocalToolOptions): Promise<{
    translate(text: string): Promise<string>;
    destroy(): void;
  }>;
}

export type BrowserLocalAPIs = Window & {
  Writer?: LocalFactory<WriterSession>;
  Translator?: TranslatorFactory;
  Summarizer?: LocalFactory<SummarySession>;
  Proofreader?: LocalFactory<ProofSession>;
  SpeechRecognition?: SpeechFactory;
  webkitSpeechRecognition?: SpeechFactory;
};
