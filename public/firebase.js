/** Browser-only Firebase runtime; GitHub Pages needs no Node server. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAuth, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { firebaseConfig } from './config.js';

export const configured = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_') &&
  firebaseConfig.projectId && !firebaseConfig.projectId.startsWith('PASTE_') &&
  firebaseConfig.appId && !firebaseConfig.appId.startsWith('PASTE_'));
export const app = configured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
if (auth) setPersistence(auth, browserLocalPersistence).catch(console.warn);

export function helpfulError(error) {
  const code = String(error?.code || '');
  if (code.includes('permission-denied')) return 'Permission denied. Check the staff role and deploy the Firestore security rules.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Incorrect reception email or password.';
  if (code.includes('auth/unauthorized-domain')) return 'Add this website domain to Firebase Authentication → Settings → Authorized domains.';
  if (code.includes('unavailable') || code.includes('network-request-failed')) return 'Connection unavailable. Check your internet connection and try again.';
  return error?.message || 'Something went wrong. Please try again.';
}
