import { usesAndroidModel } from "../../services/androidNano";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { app, auth, appCheck, db } from "./config";
async function request(path: string, body?: unknown, method = "POST") {
  if (!auth?.currentUser || !appCheck)
    throw new Error("Family features require Firebase sign-in and App Check.");
  const [id, check] = await Promise.all([
    auth.currentUser.getIdToken(),
    getAppCheckToken(appCheck),
  ]);
  const response = await fetch(
    `${import.meta.env.VITE_BACKEND_URL || ""}${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${id}`,
        "X-Firebase-AppCheck": check.token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  if (!isJson)
    throw new Error(
      "The family backend did not return an API response. Check that the Python service and Hosting routes are deployed.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Family service unavailable.",
    );
  return data;
}
export const createInvite = () => request("/pair/invite");
export const joinFamily = (code: string) =>
  request("/pair/join", { code: code.trim() });
export const sendAlert = (stages: number) => request("/alerts", { stages });
export const removeMember = (uid: string) =>
  request(`/pair/${encodeURIComponent(uid)}`, undefined, "DELETE");
export async function enableNotifications() {
  if (usesAndroidModel) {
    const { androidPushToken } =
      await import("../../services/androidNotifications");
    const token = await androidPushToken();
    await request("/notifications/token", { token });
    return;
  }
  if (!app || !("Notification" in window))
    throw new Error("Push notifications are unavailable in this browser.");
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY)
    throw new Error("Configure the Firebase public VAPID key first.");
  if (!window.isSecureContext)
    throw new Error("Notifications require the secure VaultShield website (HTTPS).");
  if (Notification.permission === "denied")
    throw new Error(
      "Notifications are blocked for this website. Open the site controls beside the address bar, allow Notifications, then try again. Family alerts still appear in your inbox.",
    );
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications were not allowed. Check Chrome's permission chip or this site's notification setting, then try again. Family alerts still appear in your inbox.",
    );
  if (!(await isSupported()))
    throw new Error("Push notifications are unavailable in this browser.");
  if (!("serviceWorker" in navigator))
    throw new Error("Background notifications are unavailable in this browser.");
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  await request("/notifications/token", { token });
}
export function watchFamily(
  onMembers: (ids: string[]) => void,
  onAlerts: (items: { id: string; stages: number }[]) => void,
  onError: (error: Error) => void,
) {
  if (!db || !auth?.currentUser) return () => {};
  const root = collection(db, "users", auth.currentUser.uid, "family");
  const a = onSnapshot(
    root,
    (s) => onMembers(s.docs.map((d) => d.id)),
    onError,
  );
  // Read both schema versions during the backend rollout; all writes remain server-only.
  type InboxItem = { id: string; stages: number; time: number };
  const inbox = new Map<string, InboxItem[]>();
  const subscriptions = ["timestamp", "createdAt"].map((field) =>
    onSnapshot(
      query(
        collection(db!, "users", auth!.currentUser!.uid, "alerts"),
        orderBy(field, "desc"),
        limit(10),
      ),
      (snapshot) => {
        inbox.set(
          field,
          snapshot.docs.map((doc) => {
            const value = doc.data();
            return {
              id: doc.id,
              stages: value.tacticCount ?? value.stages ?? 0,
              time: value[field]?.toMillis?.() ?? 0,
            };
          }),
        );
        const unique = new Map(
          [...inbox.values()].flat().map((item) => [item.id, item]),
        );
        onAlerts(
          [...unique.values()]
            .sort((left, right) => right.time - left.time)
            .slice(0, 10)
            .map(({ id, stages }) => ({ id, stages })),
        );
      },
      onError,
    ),
  );
  return () => {
    a();
    subscriptions.forEach((unsubscribe) => unsubscribe());
  };
}
