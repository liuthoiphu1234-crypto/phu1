const express = require('express');
const router = express.Router();
const { getDashboardAnalytics } = require('../controllers/analyticsController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/dashboard', protect, adminOnly, getDashboardAnalytics);

module.exports = router;
