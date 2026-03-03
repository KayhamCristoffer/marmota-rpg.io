const express = require('express');
const router  = express.Router();
const { isAuth } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/stats',       isAuth, userController.getStats);
router.put('/nickname',    isAuth, userController.updateNickname);

module.exports = router;
