/* ================================================================
   FIREBASE-CONFIG.JS – Configuração compartilhada do Firebase SDK
   Usado por: index.html, home.html, admin.html
   ================================================================ */

import { initializeApp }        from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics }         from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import { getAuth }              from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getDatabase }          from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

// ── Credenciais do projeto marmota-rpg ──────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyB9Tk0JEGdMgRQHVaS0zEd2Vy0Z1f-RU8Q",
  authDomain:        "marmota-rpg.firebaseapp.com",
  databaseURL:       "https://marmota-rpg-default-rtdb.firebaseio.com",
  projectId:         "marmota-rpg",
  storageBucket:     "marmota-rpg.firebasestorage.app",
  messagingSenderId: "1045625225684",
  appId:             "1:1045625225684:web:e76bf77bb5c69665831641",
  measurementId:     "G-V0T2VYP0LQ"
};

// ── Inicialização ────────────────────────────────────────────────
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth      = getAuth(app);
const database  = getDatabase(app);

export { app, analytics, auth, database };
