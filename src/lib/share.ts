/** POST shares are intercepted by the installed PWA worker, so raw text never enters a URL. */
export async function takeSharedInput(): Promise<{
  text: string;
  file: File | null;
} | null> {
  const id = new URLSearchParams(location.search).get("share");
  if (!id) return null;
  history.replaceState(null, "", location.pathname);
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, 5000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(e.data);
    };
    worker.postMessage({ type: "TAKE_SHARE", id }, [channel.port2]);
  });
}
