import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

// Use CDN for WASM runtime to avoid bundler path issues
(env as any).backends = (env as any).backends ?? {};
((env as any).backends.onnx ??= {}).wasm ??= {};
((env as any).backends.onnx.wasm as any).wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/";

let pipe: Awaited<ReturnType<typeof pipeline>> | null = null;

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type !== "transcribe") return;

  try {
    if (!pipe) {
      self.postMessage({ type: "status", text: "Downloading Whisper model (first time only, ~75 MB)…" });
      pipe = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        progress_callback(p: { status: string; progress?: number }) {
          if (p.status === "progress" && p.progress != null) {
            self.postMessage({ type: "status", text: `Downloading model… ${Math.round(p.progress)}%` });
          }
        },
      });
    }

    self.postMessage({ type: "status", text: "Transcribing on your device…" });

    const result = await (pipe as any)(e.data.audio as Float32Array, {
      task: "transcribe",
      language: null,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });

    self.postMessage({ type: "done", text: (result as { text: string }).text ?? "" });
  } catch (err) {
    self.postMessage({
      type: "error",
      text: err instanceof Error ? err.message : "Transcription failed.",
    });
  }
};
