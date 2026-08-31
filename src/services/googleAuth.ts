import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.setCustomParameters({
  prompt: "consent",
});

let isSigningIn = false;
let cachedAccessToken: string | null = localStorage.getItem("google_sheets_access_token") || null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Impossibile recuperare il token di accesso Google da Firebase Auth.");
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem("google_sheets_access_token", cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Errore durante l'accesso con Google:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || localStorage.getItem("google_sheets_access_token") || null;
};

export const googleLogout = async () => {
  try {
    await auth.signOut();
  } catch (e) {
    console.warn("Sign out error:", e);
  }
  cachedAccessToken = null;
  localStorage.removeItem("google_sheets_access_token");
};

export const OAUTH_CLIENT_ID = (firebaseConfig as any).oAuthClientId || "";
