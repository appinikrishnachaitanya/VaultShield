import { usesAndroidModel } from "../../services/androidNano";
import { countedFetch } from "../netProof";
import type { PatternSignal, TrendingPatterns } from "../patterns";
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
  const response = await countedFetch(
    "family",
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
export const createInvite = (name: string) =>
  request("/pair/invite", { name: name.trim() });
export const joinFamily = (code: string, name: string) =>
  request("/pair/join", { code: code.trim(), name: name.trim() });
export const sendAlert = (stages: number) => request("/alerts", { stages });
export const sharePattern = (signal: PatternSignal) =>
  request("/patterns", signal);
export const loadTrendingPatterns = async (): Promise<TrendingPatterns> =>
  request("/patterns/trending", undefined, "GET");
export const removeMember = (uid: string) =>
  request(`/pair/${encodeURIComponent(uid)}`, undefined, "DELETE");
export const labelMember = (uid: string, name: string) =>
  request(`/pair/${encodeURIComponent(uid)}/label`, { name: name.trim() });
export function notificationPermissionHelp(permission: NotificationPermission) {
  if (permission === "denied")
    return "Notifications are blocked for VaultShield. Open this website's permissions in your browser, set Notifications to Allow, then try again. Family help requests still appear in your inbox.";
  if (permission === "default")
    return "No notification choice was received. Check the browser's permission prompt near the address bar, or allow Notifications in this website's permissions, then try again. Family help requests still appear in your inbox.";
  return "Notifications are allowed.";
}
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
    throw new Error(
      "Notifications require the secure VaultShield website (HTTPS).",
    );
  if (Notification.permission === "denied")
    throw new Error(notificationPermissionHelp("denied"));
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(notificationPermissionHelp(permission));
  if (!(await isSupported()))
    throw new Error("Push notifications are unavailable in this browser.");
  if (!("serviceWorker" in navigator))
    throw new Error(
      "Background notifications are unavailable in this browser.",
    );
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    throw new Error(
      "VaultShield could not start background notifications. Reload the website and try again; your family inbox still works.",
    );
  }
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      readyTimer = setTimeout(
        () =>
          reject(
            new Error(
              "Background notifications did not become ready. Reload the website and try again; your family inbox still works.",
            ),
          ),
        15000,
      );
    }),
  ]).finally(() => clearTimeout(readyTimer));
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token)
    throw new Error(
      "This browser did not provide a notification token. Your family inbox still works.",
    );
  await request("/notifications/token", { token });
}
export function watchFamily(
  onMembers: (members: { id: string; name: string }[]) => void,
  onAlerts: (
    items: { id: string; stages: number; senderName: string; time: number }[],
  ) => void,
  onError: (error: Error) => void,
) {
  if (!db || !auth?.currentUser) return () => {};
  const root = collection(db, "users", auth.currentUser.uid, "family");
  const a = onSnapshot(
    root,
    (s) =>
      onMembers(
        s.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Family member",
        })),
      ),
    onError,
  );
  // Read both schema versions during the backend rollout; all writes remain server-only.
  type InboxItem = {
    id: string;
    stages: number;
    time: number;
    senderName: string;
  };
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
              senderName:
                typeof value.senderName === "string"
                  ? value.senderName
                  : "Family member",
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
            .map(({ id, stages, senderName, time }) => ({
              id,
              stages,
              senderName,
              time,
            })),
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
