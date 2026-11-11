const express = require('express');
const router = express.Router();
const {
  getCoupons,
  applyCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon
} = require('../controllers/couponController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/', getCoupons);
router.post('/apply', applyCoupon);
router.post('/', protect, adminOnly, createCoupon);
router.put('/:id', protect, adminOnly, updateCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);

module.exports = router;
