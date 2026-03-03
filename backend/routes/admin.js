const express = require('express');
const router  = express.Router();
const { isAuth, isAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const { resetDailyRanking, resetWeeklyRanking, resetMonthlyRanking } = require('../controllers/rankingController');
const admin = require('firebase-admin');

// ─── Quests CRUD ─────────────────────────────────────────────────
router.get('/quests',              isAuth, isAdmin, adminController.getAllQuests);
router.post('/quests',             isAuth, isAdmin, adminController.createQuest);
router.put('/quests/:id',          isAuth, isAdmin, adminController.updateQuest);
router.delete('/quests/:id',       isAuth, isAdmin, adminController.deleteQuest);
router.patch('/quests/:id/toggle', isAuth, isAdmin, adminController.toggleQuest);

// ─── Submissions ─────────────────────────────────────────────────
router.get('/submissions',                  isAuth, isAdmin, adminController.getPendingSubmissions);
router.post('/submissions/:id/approve',     isAuth, isAdmin, adminController.approveSubmission);
router.post('/submissions/:id/reject',      isAuth, isAdmin, adminController.rejectSubmission);

// ─── Users ───────────────────────────────────────────────────────
router.get('/users',               isAuth, isAdmin, adminController.getAllUsers);
router.put('/users/:uid/role',     isAuth, isAdmin, adminController.updateUserRole);

// ─── Ranking reset ────────────────────────────────────────────────
router.post('/ranking/reset', isAuth, isAdmin, async (req, res) => {
  const { period } = req.body;
  const db = admin.database();
  try {
    switch (period) {
      case 'daily':   await resetDailyRanking(db);   break;
      case 'weekly':  await resetWeeklyRanking(db);  break;
      case 'monthly': await resetMonthlyRanking(db); break;
      default: return res.status(400).json({ error: 'Invalid period' });
    }
    res.json({ message: `${period} ranking reset!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
