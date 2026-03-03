require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const cron     = require('node-cron');
const path     = require('path');
const admin    = require('firebase-admin');

const app = express();

// ─── Firebase Admin Init ─────────────────────────────────────────
const serviceAccount = {
  type:                        "service_account",
  project_id:                  process.env.FIREBASE_PROJECT_ID,
  private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key:                 (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email:                process.env.FIREBASE_CLIENT_EMAIL,
  client_id:                   process.env.FIREBASE_CLIENT_ID,
  auth_uri:                    "https://accounts.google.com/o/oauth2/auth",
  token_uri:                   "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:        process.env.FIREBASE_CERT_URL
};

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
exports.db    = db;
exports.admin = admin;

// ─── Middlewares ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Serve frontend estático
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/quests',  require('./routes/quests'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/upload',  require('./routes/upload'));

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime(), db: 'Firebase Realtime Database' });
});

// SPA fallback (html files)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

// ─── CRON Jobs ───────────────────────────────────────────────────
const { resetDailyRanking, resetWeeklyRanking, resetMonthlyRanking } = require('./controllers/rankingController');

// Reset diário 00:00
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ [CRON] Daily reset...');
  await resetDailyRanking(db);
}, { timezone: 'America/Sao_Paulo' });

// Reset semanal - domingo 00:00
cron.schedule('0 0 * * 0', async () => {
  console.log('⏰ [CRON] Weekly reset...');
  await resetWeeklyRanking(db);
}, { timezone: 'America/Sao_Paulo' });

// Reset mensal - dia 1 às 00:00
cron.schedule('0 0 1 * *', async () => {
  console.log('⏰ [CRON] Monthly reset...');
  await resetMonthlyRanking(db);
}, { timezone: 'America/Sao_Paulo' });

// ─── Start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RPG Quests v2.0 running on http://localhost:${PORT}`);
  console.log(`🔥 Firebase Realtime Database connected`);
  console.log(`📁 GitHub image storage enabled`);
});
