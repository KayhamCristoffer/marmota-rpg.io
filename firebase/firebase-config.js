/* ================================================================
   firebase/firebase-config.js
   Configuração central do Firebase – SDK v12.10.0 via CDN ESM
   Usado por: database.js, services-config.js, session-manager.js
   ================================================================ */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics }           from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";

/* ── Credenciais do projeto marmota-rpg ─────────────────────── */
export const firebaseConfig = {
  apiKey:            "AIzaSyB9Tk0JEGdMgRQHVaS0zEd2Vy0Z1f-RU8Q",
  authDomain:        "marmota-rpg.firebaseapp.com",
  databaseURL:       "https://marmota-rpg-default-rtdb.firebaseio.com",
  projectId:         "marmota-rpg",
  storageBucket:     "marmota-rpg.firebasestorage.app",
  messagingSenderId: "1045625225684",
  appId:             "1:1045625225684:web:e76bf77bb5c69665831641",
  measurementId:     "G-V0T2VYP0LQ"
};

/* ── UID do administrador fixo ──────────────────────────────── */
export const ADMIN_UID = "F69XMBOumJSiuBvQm3c63HyJAjy2";

/* ── Inicializar app (evita duplicação) ─────────────────────── */
export const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

/* ── Analytics (opcional, não bloqueia se falhar) ──────────── */
let analytics = null;
try { analytics = getAnalytics(app); } catch (_) {}
export { analytics };
