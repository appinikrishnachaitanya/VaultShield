// Loaded by the generated PWA worker. Original messages are held briefly in memory only.
const sharedItems = new Map();
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname !== "/share-target" ||
    event.request.method !== "POST"
  )
    return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const id = crypto.randomUUID();
      const file = form.get("image");
      sharedItems.set(id, {
        text: [form.get("title"), form.get("text"), form.get("url")]
          .filter((x) => typeof x === "string")
          .join("\n"),
        file:
          file instanceof File &&
          ["image/jpeg", "image/png"].includes(file.type) &&
          file.size <= 8 * 1024 * 1024
            ? file
            : null,
      });
      setTimeout(() => sharedItems.delete(id), 60000);
      return Response.redirect(new URL("/?share=" + id, self.location.origin).href, 303);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "TAKE_SHARE" || !event.ports[0]) return;
  const data = sharedItems.get(event.data.id);
  sharedItems.delete(event.data.id);
  event.ports[0].postMessage(data || null);
});
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload?.notification) return;
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const windowClient of windows)
        windowClient.postMessage({ type: "VAULTSHIELD_FAMILY_ALERT" });
      await self.registration.showNotification(
        payload.notification.title || "VaultShield",
        {
          body: payload.notification.body || "A family member requested help.",
          icon: "/shield.svg",
          tag: "vaultshield-family-help",
          data: { url: new URL("/?view=family", self.location.origin).href },
        },
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (windows.length) {
        windows[0].postMessage({ type: "VAULTSHIELD_OPEN_FAMILY" });
        await windows[0].focus();
        return;
      }
      await clients.openWindow(
        new URL("/?view=family", self.location.origin).href,
      );
    })(),
  );
});
