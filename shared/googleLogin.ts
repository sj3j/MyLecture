/**
 * Google sign-in, shared by both API surfaces.
 *
 * Accepts either kind of token:
 *
 *   idToken       a FIREBASE token, from the web popup path
 *                 (iss: securetoken.google.com/<project>, aud: <projectId>)
 *   googleIdToken a raw GOOGLE OAuth token, from the native plugin
 *                 (iss: accounts.google.com, aud: <oauth client id>)
 *
 * They are NOT interchangeable. `admin.auth().verifyIdToken()` rejects a Google
 * token outright on `aud`/`iss`, so the native path is verified with
 * google-auth-library instead.
 *
 * The native path deliberately never creates a client-side Firebase identity.
 * The old web flow signs in with a popup (minting a Firebase account under the
 * Google uid), signs out, then signs in again with a custom token under a
 * DIFFERENT uid - orphaning the first account forever. Sending the raw Google
 * token straight here means only one identity is ever created.
 */

export interface GoogleIdentity {
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export class GoogleLoginError extends Error {
  constructor(message: string, readonly status = 401, readonly code?: string) {
    super(message);
  }
}

/** Verifies whichever token was supplied and returns the identity it asserts. */
export async function verifyGoogleIdentity(opts: {
  adminAuth: { verifyIdToken(t: string): Promise<any> };
  oauthClient: { verifyIdToken(o: { idToken: string; audience: string | string[] }): Promise<any> };
  audience: string;
  idToken?: string;
  googleIdToken?: string;
}): Promise<GoogleIdentity> {
  const { adminAuth, oauthClient, audience, idToken, googleIdToken } = opts;

  let email: string | undefined;
  let name: string | null = null;
  let emailVerified = false;

  if (googleIdToken) {
    const ticket = await oauthClient.verifyIdToken({ idToken: googleIdToken, audience });
    const payload = ticket.getPayload?.() ?? ticket.payload ?? ticket;
    email = payload?.email;
    name = payload?.name ?? null;
    emailVerified = payload?.email_verified === true;
  } else if (idToken) {
    const decoded = await adminAuth.verifyIdToken(idToken);
    email = decoded?.email;
    name = decoded?.name ?? null;
    emailVerified = decoded?.email_verified === true;
  } else {
    throw new GoogleLoginError('Missing idToken', 400);
  }

  if (!email) throw new GoogleLoginError('No email associated.', 400);

  // THE account-takeover guard. Google will issue an ID token for an account
  // whose email is not verified, and this server reconciles purely on `email` -
  // so without this check anyone could register a Google account claiming a
  // classmate's university address and be handed a token for THEIR account.
  if (!emailVerified) {
    throw new GoogleLoginError('Email is not verified with Google.', 401, 'EMAIL_NOT_VERIFIED');
  }

  return { email: email.toLowerCase().trim(), name, emailVerified };
}

export interface GoogleLoginResult {
  customToken: string;
  uid: string;
  email: string;
}

/**
 * Whitelist check + `users`-by-email reconciliation + custom token.
 *
 * Reconciling on the email is what makes a student who signs in with Google land
 * on the SAME profile they use with a password, whatever uid that document
 * happens to be keyed by (password logins key by email, Google logins by the
 * Google uid, and both shapes exist in the data).
 */
export async function resolveGoogleLogin(
  db: FirebaseFirestore.Firestore,
  adminAuth: { createCustomToken(uid: string, claims?: object): Promise<string> },
  identity: GoogleIdentity,
  opts: {
    masterAdminEmails: string[];
    fallbackUid: string;
    syncUserStage: (uid: string, source: any) => Promise<void>;
  },
): Promise<GoogleLoginResult> {
  const emailLower = identity.email;
  let stageSource: { stageId?: string | null; managedStageId?: string | null } = {};

  if (!opts.masterAdminEmails.includes(emailLower)) {
    const adminDoc = await db.collection('allowed_admins').doc(emailLower).get();
    if (adminDoc.exists) {
      stageSource = { managedStageId: adminDoc.data()?.managedStageId };
    } else {
      const studentDoc = await db.collection('students').doc(emailLower).get();
      if (!studentDoc.exists) {
        // Distinguishable from a wrong password: they have just proved they own
        // this mailbox, so telling them there is no account is safe - and the
        // app routes them to signup instead of a dead end blaming a password
        // they never set.
        throw new GoogleLoginError('No account for this email.', 404, 'NO_ACCOUNT');
      }
      if (studentDoc.data()?.isActive === false) {
        throw new GoogleLoginError('الحساب معطل', 401, 'DISABLED');
      }
      stageSource = { stageId: studentDoc.data()?.stageId };
    }
  }

  let targetUid = opts.fallbackUid;
  const usersQuery = await db.collection('users').where('email', '==', emailLower).limit(1).get();
  if (!usersQuery.empty) {
    targetUid = usersQuery.docs[0].id;
    await opts.syncUserStage(targetUid, stageSource);
  }

  const customToken = await adminAuth.createCustomToken(targetUid, { email: emailLower });
  return { customToken, uid: targetUid, email: emailLower };
}
