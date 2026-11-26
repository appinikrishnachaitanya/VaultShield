import { useEffect, useState } from "react";

type InferenceSource = "ON_DEVICE" | "IN_CLOUD";

let _last: InferenceSource | null = null;

export function setLastAISource(src: InferenceSource) {
  _last = src;
  window.dispatchEvent(new CustomEvent("vaultshield-ai-source", { detail: src }));
}

export function useLastAISource(): InferenceSource | null {
  const [src, setSrc] = useState<InferenceSource | null>(_last);
  useEffect(() => {
    const handler = (e: Event) => setSrc((e as CustomEvent<InferenceSource>).detail);
    window.addEventListener("vaultshield-ai-source", handler);
    return () => window.removeEventListener("vaultshield-ai-source", handler);
  }, []);
  return src;
}
