// ─── Middleware: Verificar autenticação ──────────────────────────
const isAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized - Please login with Discord' });
};

// ─── Middleware: Verificar admin ─────────────────────────────────
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden - Admin only' });
};

module.exports = { isAuth, isAdmin };
