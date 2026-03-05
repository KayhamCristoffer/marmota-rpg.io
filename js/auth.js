/* ================================================================
   js/auth.js  –  Ponto de entrada de autenticação para home.html
   e admin.html. Apenas importa o session-manager que faz tudo.
   ================================================================ */

// O session-manager inicializa o Firebase, registra window.RPG.*,
// preenche a sidebar e gerencia onAuthStateChanged.
// Não precisa de nenhuma lógica extra aqui.

import "../firebase/session-manager.js";
