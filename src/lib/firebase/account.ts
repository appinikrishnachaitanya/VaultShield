import {
  GoogleAuthProvider,
  linkWithRedirect,
  getRedirectResult,
  linkWithCredential,
  signInWithCredential,
  signOut,
  signInAnonymously,
  type AuthCredential,
} from "firebase/auth";
import { registerPlugin } from "@capacitor/core";
import { auth } from "./config";
import { usesAndroidModel } from "../../services/androidNano";
const native = registerPlugin<{ googleToken(): Promise<{ idToken: string }> }>(
  "VaultShieldAccount",
);
export class ExistingAccount extends Error {
  constructor(public credential: AuthCredential) {
    super(
      "This Google account already has a VaultShield account. Continue to open its saved family circle. Your current guest circle stays separate.",
    );
  }
}
export async function continueWithGoogle() {
  if (!auth?.currentUser)
    throw new Error(
      "Your private session is still connecting. Please try again.",
    );
  let nativeCredential: AuthCredential | undefined;
  try {
    if (usesAndroidModel) {
      const { idToken } = await native.googleToken();
      nativeCredential = GoogleAuthProvider.credential(idToken);
      await linkWithCredential(auth.currentUser, nativeCredential);
    } else {
      await linkWithRedirect(auth.currentUser, new GoogleAuthProvider());
      // Page navigates to Google — execution stops here
    }
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "auth/credential-already-in-use") {
      const credential =
        nativeCredential ||
        GoogleAuthProvider.credentialFromError(
          error as import("firebase/app").FirebaseError,
        );
      if (credential) throw new ExistingAccount(credential);
    }
    throw error;
  }
}

// Call on page load to process a returning Google redirect
export async function handleGoogleRedirect(): Promise<boolean> {
  if (!auth) return false;
  try {
    const result = await getRedirectResult(auth);
    return result !== null;
  } catch (error) {
    const e = error as { code?: string };
    if (e.code === "auth/credential-already-in-use") {
      const credential = GoogleAuthProvider.credentialFromError(
        error as import("firebase/app").FirebaseError,
      );
      if (credential) throw new ExistingAccount(credential);
    }
    throw error;
  }
}
export async function openExistingAccount(credential: AuthCredential) {
  if (auth) await signInWithCredential(auth, credential);
}
export async function leaveAccount() {
  if (!auth) return;
  await signOut(auth);
  await signInAnonymously(auth);
}
