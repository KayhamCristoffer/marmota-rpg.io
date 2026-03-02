require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const app = express();

// ─── Middlewares ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'rpg-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── Serve static files from root (frontend) ────────────────────
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ─── Passport Config ────────────────────────────────────────────
require('./config/passport')(passport);

// ─── Routes ─────────────────────────────────────────────────────
app.use('/auth',     require('./routes/auth'));
app.use('/api/quests',   require('./routes/quests'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/ranking',  require('./routes/ranking'));
app.use('/api/admin',    require('./routes/admin'));

// ─── MongoDB Connection ──────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rpg-quests')
  .then(() => {
    console.log('✅ MongoDB connected');
    startCronJobs();
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── CRON Jobs (Reset Rankings) ─────────────────────────────────
function startCronJobs() {
  const { resetDailyRanking, resetWeeklyRanking, resetMonthlyRanking } = require('./controllers/rankingController');

  // Reset diário às 00:00
  cron.schedule('0 0 * * *', () => {
    console.log('⏰ [CRON] Resetting daily ranking...');
    resetDailyRanking();
  }, { timezone: 'America/Sao_Paulo' });

  // Reset semanal - Domingo 00:00
  cron.schedule('0 0 * * 0', () => {
    console.log('⏰ [CRON] Resetting weekly ranking...');
    resetWeeklyRanking();
  }, { timezone: 'America/Sao_Paulo' });

  // Reset mensal - Dia 1 às 00:00
  cron.schedule('0 0 1 * *', () => {
    console.log('⏰ [CRON] Resetting monthly ranking...');
    resetMonthlyRanking();
  }, { timezone: 'America/Sao_Paulo' });

  console.log('⏰ CRON jobs scheduled');
}

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
});

// ─── Start Server ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🎮 RPG Quests Backend v1.0.0`);
});
