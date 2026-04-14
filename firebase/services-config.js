/* ================================================================
   firebase/services-config.js
   Exporta instâncias prontas de Auth e Database
   Importa de firebase-config.js para garantir um único app
   ================================================================ */

import { app }        from "./firebase-config.js";
import { getAuth }    from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getDatabase} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

/* ── Auth ────────────────────────────────────────────────────── */
export const auth = getAuth(app);

/* ── Realtime Database ──────────────────────────────────────── */
export const db = getDatabase(app);

/* ── Providers disponíveis ──────────────────────────────────── */
export {
  GoogleAuthProvider,
  GithubAuthProvider,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

/* ── Helpers de auth re-exportados ─────────────────────────── */
export {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

/* ── Helpers de DB re-exportados ────────────────────────────── */
export {
  ref,
  get,
  set,
  update,
  push,
  remove,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  limitToLast,
  onValue,
  off,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
