import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  channel: vi.fn(),
  register: vi.fn(),
  add: vi.fn(),
  handlers: new Map<string, (value?: unknown) => void>(),
  removals: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: mocks.permission,
    requestPermissions: mocks.request,
    createChannel: mocks.channel,
    register: mocks.register,
    addListener: mocks.add,
  },
}));
import {
  androidPushToken,
  watchAndroidPush,
} from "../src/services/androidNotifications";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers.clear();
  mocks.removals.length = 0;
  mocks.permission.mockResolvedValue({ receive: "granted" });
  mocks.channel.mockResolvedValue(undefined);
  mocks.add.mockImplementation(async (event, callback) => {
    mocks.handlers.set(event, callback);
    const remove = vi.fn();
    mocks.removals.push(remove);
    return { remove };
  });
  mocks.register.mockImplementation(async () =>
    mocks.handlers.get("registration")?.({ value: "synthetic-test-token" }),
  );
});
afterEach(() => vi.useRealTimers());
it("obtains a native token and removes temporary registration listeners", async () => {
  expect(await androidPushToken()).toBe("synthetic-test-token");
  expect(mocks.channel).toHaveBeenCalledWith(
    expect.objectContaining({ id: "family_help", visibility: 0 }),
  );
  expect(mocks.removals.every((remove) => remove.mock.calls.length === 1)).toBe(
    true,
  );
});
it("never registers when notification permission is denied", async () => {
  mocks.permission.mockResolvedValue({ receive: "denied" });
  await expect(androidPushToken()).rejects.toThrow(
    "family inbox remains available",
  );
  expect(mocks.register).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});
it("requests permission before registration when Android asks for it", async () => {
  mocks.permission.mockResolvedValue({ receive: "prompt" });
  mocks.request.mockResolvedValue({ receive: "granted" });
  await androidPushToken();
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.register).toHaveBeenCalledOnce();
});
it("replaces native registration errors with a fixed message and removes listeners", async () => {
  mocks.register.mockImplementation(async () =>
    mocks.handlers.get("registrationError")?.({
      error: "sensitive native diagnostic",
    }),
  );
  await expect(androidPushToken()).rejects.toThrow(
    "Android notification registration failed.",
  );
  expect(mocks.removals.every((remove) => remove.mock.calls.length === 1)).toBe(
    true,
  );
});
it("handles notification receipt and taps separately without consuming private payloads", async () => {
  const received = vi.fn(),
    opened = vi.fn();
  const stop = await watchAndroidPush(received, opened);
  mocks.handlers.get("pushNotificationReceived")?.({
    arbitrary: "not passed to UI",
  });
  expect(received).toHaveBeenCalledWith();
  expect(opened).not.toHaveBeenCalled();
  mocks.handlers.get("pushNotificationActionPerformed")?.();
  expect(opened).toHaveBeenCalledWith();
  stop();
  expect(mocks.removals.every((remove) => remove.mock.calls.length === 1)).toBe(
    true,
  );
});
