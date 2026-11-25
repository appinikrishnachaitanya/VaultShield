/** Session-scoped privacy impact tracker. Never persisted — clears on page reload. */

type Stats = {
  identifiersMasked: number;
  bytesSaved: number;
  checksRun: number;
  documentsScanned: number;
};

const stats: Stats = {
  identifiersMasked: 0,
  bytesSaved: 0,
  checksRun: 0,
  documentsScanned: 0,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function recordCheck(masked: number, rawBytes: number, sentBytes: number) {
  stats.identifiersMasked += masked;
  stats.bytesSaved += Math.max(0, rawBytes - sentBytes);
  stats.checksRun += 1;
  notify();
}

export function recordDocumentScan(masked: number, rawBytes: number, sentBytes: number) {
  stats.identifiersMasked += masked;
  stats.bytesSaved += Math.max(0, rawBytes - sentBytes);
  stats.documentsScanned += 1;
  notify();
}

export function getStats(): Readonly<Stats> {
  return { ...stats };
}

export function onStatsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
