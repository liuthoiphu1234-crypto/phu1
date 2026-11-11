const express = require('express');
const router = express.Router();
const {
  getReviews,
  getReviewsByProduct,
  createReview,
  toggleApproveReview,
  deleteReview
} = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/', getReviews);
router.get('/product/:productId', getReviewsByProduct);
router.post('/', createReview);
router.put('/:id/toggle', protect, adminOnly, toggleApproveReview);
router.delete('/:id', protect, adminOnly, deleteReview);

module.exports = router;
