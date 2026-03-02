const express = require('express');
const router = express.Router();
const { isAuth } = require('../middleware/auth');
const questController = require('../controllers/questController');

router.get('/',           isAuth, questController.getAllQuests);
router.get('/my',         isAuth, questController.getMyQuests);
router.post('/:id/take',  isAuth, questController.takeQuest);
router.post('/:id/submit',isAuth, questController.submitQuest);

module.exports = router;
