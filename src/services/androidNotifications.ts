import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";

// Tokens stay out of logs. The caller sends one token to the authenticated backend.
export async function androidPushToken(): Promise<string> {
  let permission = await PushNotifications.checkPermissions();
  if (
    permission.receive === "prompt" ||
    permission.receive === "prompt-with-rationale"
  )
    permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted")
    throw new Error(
      "Notification permission was not granted. Your family inbox remains available.",
    );
  await PushNotifications.createChannel({
    id: "family_help",
    name: "Family help requests",
    importance: 4,
    visibility: 0,
  });
  const listeners: PluginListenerHandle[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Android notification registration timed out. Try again.",
            ),
          ),
        30000,
      );
      void (async () => {
        listeners.push(
          await PushNotifications.addListener("registration", (token) =>
            token.value
              ? resolve(token.value)
              : reject(new Error("Android notification registration failed.")),
          ),
        );
        listeners.push(
          await PushNotifications.addListener("registrationError", () =>
            reject(new Error("Android notification registration failed.")),
          ),
        );
        await PushNotifications.register();
      })().catch(() =>
        reject(new Error("Android notification registration failed.")),
      );
    });
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
  }
}

export async function watchAndroidPush(onHelp: () => void, onOpen: () => void) {
  const received = await PushNotifications.addListener(
    "pushNotificationReceived",
    () => onHelp(),
  );
  try {
    const opened = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      () => onOpen(),
    );
    return () => {
      void received.remove();
      void opened.remove();
    };
  } catch (error) {
    await received.remove();
    throw error;
  }
}
