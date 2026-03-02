const express = require('express');
const router = express.Router();
const { isAuth, isAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const upload = require('../middleware/upload');

// ─── Quests CRUD ─────────────────────────────────────────────────
router.get('/quests',            isAuth, isAdmin, adminController.getAllQuestsAdmin);
router.post('/quests',           isAuth, isAdmin, adminController.createQuest);
router.put('/quests/:id',        isAuth, isAdmin, adminController.updateQuest);
router.delete('/quests/:id',     isAuth, isAdmin, adminController.deleteQuest);
router.patch('/quests/:id/toggle', isAuth, isAdmin, adminController.toggleQuest);

// ─── Review de prints ────────────────────────────────────────────
router.get('/submissions',       isAuth, isAdmin, adminController.getPendingSubmissions);
router.post('/submissions/:id/approve', isAuth, isAdmin, adminController.approveSubmission);
router.post('/submissions/:id/reject',  isAuth, isAdmin, adminController.rejectSubmission);

// ─── Usuários ────────────────────────────────────────────────────
router.get('/users',             isAuth, isAdmin, adminController.getAllUsers);
router.put('/users/:id/role',    isAuth, isAdmin, adminController.updateUserRole);

// ─── Reset rankings ──────────────────────────────────────────────
router.post('/ranking/reset',    isAuth, isAdmin, adminController.manualResetRanking);

module.exports = router;
