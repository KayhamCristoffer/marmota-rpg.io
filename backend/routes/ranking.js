const express = require('express');
const router  = express.Router();
const { isAuth } = require('../middleware/auth');
const rankingController = require('../controllers/rankingController');

router.get('/', isAuth, rankingController.getRanking);

module.exports = router;
