import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * ─────────────────────────────────────────────
 *  FIREBASE CONFIGURATION
 *  Replace the values below with your own
 *  Firebase project credentials from:
 *  https://console.firebase.google.com
 * ─────────────────────────────────────────────
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000",
};

export const isFirebaseConfigured =
  !!import.meta.env.VITE_FIREBASE_API_KEY &&
  !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  !!import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  !!import.meta.env.VITE_FIREBASE_APP_ID;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
