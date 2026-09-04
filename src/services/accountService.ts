/**
 * The account actions a student can take on themselves.
 *
 * Every one of these goes through the API rather than the Firestore SDK,
 * because they all end in a write to `students/{id}` and firestore.rules makes
 * that collection admin-write-only. The server resolves which document from
 * the verified token, so nothing here sends an id.
 */
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { apiUrl } from '../lib/apiBase';
import { getGoogleToken } from '../lib/googleSignIn';

export interface AccountSummary {
  studentId: string;
  name: string;
  loginCode: string | null;
  googleEmail: string | null;
  placeholderEmail: boolean;
  mustChangePassword: boolean;
  examCode: string;
}

/** Carries the server's own Arabic message straight through to the user. */
export class AccountError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AccountError('يجب تسجيل الدخول أولاً.', 401);

  const token = await user.getIdToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AccountError(data?.error || 'تعذّر إتمام العملية.', res.status, data?.code);
  }
  return data as T;
}

export const fetchAccount = () => call<AccountSummary>('/api/me/account');

export const changePassword = (currentPassword: string, newPassword: string) =>
  call<{ ok: true }>('/api/me/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

export const submitExamCode = (examCode: string) =>
  call<{ ok: true; examCode: string }>('/api/me/exam-code', {
    method: 'POST',
    body: JSON.stringify({ examCode }),
  });

/**
 * Links a Google account to the signed-in student.
 *
 * The app's own ID token is taken BEFORE the Google popup runs, because on
 * native the plugin signs out of the Firebase layer as a side effect and
 * there would be no session left to authenticate with afterwards. For the same
 * reason the server hands back a fresh custom token, which is redeemed here so
 * the student is still signed in as themselves when this returns.
 */
export async function linkGoogle(): Promise<{ googleEmail: string; alreadyOwned: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new AccountError('يجب تسجيل الدخول أولاً.', 401);
  const appToken = await user.getIdToken();

  const { body } = await getGoogleToken();

  const res = await fetch(apiUrl('/api/me/link-google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AccountError(data?.error || 'تعذّر ربط حساب Google.', res.status, data?.code);
  }

  if (data.token) {
    await signInWithCustomToken(auth, data.token).catch(() => {});
  }
  return { googleEmail: data.googleEmail, alreadyOwned: data.alreadyOwned === true };
}

export const unlinkGoogle = () =>
  call<{ ok: true }>('/api/me/link-google', { method: 'DELETE' });

/**
 * Account deletion is a REQUEST, reviewed by the stage representative.
 *
 * Google Play accepts an in-app request flow, and a queue is the right shape
 * here: approving one purges an Auth identity and a dozen documents, and the
 * roster it touches belongs to the college rather than to the student alone.
 * Nothing is destroyed until a human approves - see shared/accountDeletion.ts.
 */
export type DeletionStatus = 'pending' | 'approved' | 'rejected' | null;

export const fetchDeletionStatus = () =>
  call<{ status: DeletionStatus }>('/api/me/deletion-request');

export const requestDeletion = (reason: string) =>
  call<{ ok: true; status: 'pending' }>('/api/me/deletion-request', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const cancelDeletion = () =>
  call<{ ok: true }>('/api/me/deletion-request', { method: 'DELETE' });
