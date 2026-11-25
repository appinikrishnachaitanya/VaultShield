import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: { uid: "guest" },
  link: vi.fn(),
  credential: vi.fn(),
  signin: vi.fn(),
}));
vi.mock("../src/lib/firebase/config", () => ({
  auth: { currentUser: mocks.user },
}));
vi.mock("../src/services/androidNano", () => ({ usesAndroidModel: false }));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({}) }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: Object.assign(class {}, {
    credentialFromError: mocks.credential,
  }),
  linkWithRedirect: mocks.link,
  getRedirectResult: vi.fn().mockResolvedValue(null),
  linkWithCredential: vi.fn(),
  signInWithCredential: mocks.signin,
  signOut: vi.fn(),
  signInAnonymously: vi.fn(),
}));
import {
  continueWithGoogle,
  ExistingAccount,
  openExistingAccount,
} from "../src/lib/firebase/account";
describe("Google account upgrade", () => {
  beforeEach(() => vi.clearAllMocks());
  it("links the guest instead of signing into a different UID", async () => {
    mocks.link.mockResolvedValue({});
    await continueWithGoogle();
    expect(mocks.link.mock.calls[0][0]).toBe(mocks.user);
    expect(mocks.signin).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before opening an existing account", async () => {
    mocks.link.mockRejectedValue({ code: "auth/credential-already-in-use" });
    const credential = { providerId: "google.com" };
    mocks.credential.mockReturnValue(credential);
    await expect(continueWithGoogle()).rejects.toBeInstanceOf(ExistingAccount);
    expect(mocks.signin).not.toHaveBeenCalled();
    await openExistingAccount(credential as never);
    expect(mocks.signin).toHaveBeenCalledWith(expect.anything(), credential);
  });
});
