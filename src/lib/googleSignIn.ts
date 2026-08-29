import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase';
import { apiUrl } from './apiBase';

/**
 * Google sign-in for both web and the installed app.
 *
 * `signInWithPopup` never opens inside a WebView - the button simply does
 * nothing - so the native build goes through the OS account picker instead.
 *
 * The two paths hand the server DIFFERENT tokens, deliberately:
 *
 *   web     a FIREBASE id token, because the popup has already signed in
 *   native  a raw GOOGLE id token, verified server-side with google-auth-library
 *
 * The native path never creates a client-side Firebase identity. The web popup
 * mints a Firebase account under the Google uid, which the code then signs out
 * of and replaces with a custom-token session under a different uid - orphaning
 * the first account. Sending the Google token straight to the server means the
 * custom-token session is the only identity that ever exists.
 */

export class NoAccountError extends Error {
  constructor(readonly email: string, readonly name: string | null) {
    super('NO_ACCOUNT');
  }
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export interface GoogleSignInResult {
  token: string;
  /** From the Google account, for seeding a brand-new users document. */
  profile: { name: string | null; email: string | null; photoUrl: string | null };
}

/** Exchanges a token for our custom token. Throws NoAccountError for signup. */
async function exchange(body: Record<string, string>): Promise<string> {
  const res = await fetch(apiUrl('/api/google-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data?.code === 'NO_ACCOUNT') {
      throw new NoAccountError(data.email || '', data.name || null);
    }
    throw new Error(data?.error || 'Authentication failed');
  }
  return data.token;
}

/**
 * Returns a custom token to sign in with, or throws.
 *
 * NoAccountError means the Google identity is valid but there is no student
 * record - the caller should route to signup rather than show a credential
 * error, since the person has just proved they own that mailbox.
 */
export async function getGoogleCustomToken(): Promise<GoogleSignInResult> {
  if (await isNative()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle();
    const googleIdToken = result.credential?.idToken;
    if (!googleIdToken) throw new Error('Google sign-in returned no token');

    const profile = {
      name: result.user?.displayName ?? null,
      email: result.user?.email ?? null,
      photoUrl: result.user?.photoUrl ?? null,
    };

    // The plugin also creates a native Firebase session as a side effect; drop
    // it so the custom-token session below is the only identity in play.
    await FirebaseAuthentication.signOut().catch(() => {});

    return { token: await exchange({ googleIdToken }), profile };
  }

  const popupResult = await signInWithPopup(auth, new GoogleAuthProvider());
  const idToken = await popupResult.user.getIdToken();
  const profile = {
    name: popupResult.user.displayName,
    email: popupResult.user.email,
    photoUrl: popupResult.user.photoURL,
  };
  await auth.signOut();
  return { token: await exchange({ idToken }), profile };
}
