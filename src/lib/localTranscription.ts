let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../workers/transcribe.worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return _worker;
}

/** Decode an audio File to 16 kHz mono Float32Array, then run Whisper locally. */
export async function transcribeAudio(
  file: File,
  onStatus: (msg: string) => void,
): Promise<string> {
  onStatus("Decoding audio…");

  const arrayBuf = await file.arrayBuffer();
  const actx = new AudioContext();
  const decoded = await actx.decodeAudioData(arrayBuf);
  await actx.close();

  const SR = 16_000;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * SR),
    SR,
  );
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);
  const resampled = await offlineCtx.startRendering();
  const audio = resampled.getChannelData(0);

  return new Promise((resolve, reject) => {
    const w = getWorker();
    const handle = (evt: MessageEvent) => {
      const { type, text } = evt.data as { type: string; text: string };
      if (type === "status") {
        onStatus(text);
        return;
      }
      w.removeEventListener("message", handle);
      if (type === "done") resolve(text);
      else reject(new Error(text || "Transcription failed."));
    };
    w.addEventListener("message", handle);
    w.postMessage({ type: "transcribe", audio }, [audio.buffer]);
  });
}
