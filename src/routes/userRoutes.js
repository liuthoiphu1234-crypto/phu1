const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  toggleBlockUser,
  updateUser,
  deleteUser,
  getCustomerStats
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Chỉ cho phép admin truy cập quản lý khách hàng
router.get('/stats', protect, adminOnly, getCustomerStats);
router.get('/', protect, adminOnly, getUsers);
router.get('/:id', protect, adminOnly, getUserById);
router.put('/:id/toggle-block', protect, adminOnly, toggleBlockUser);
router.put('/:id', protect, adminOnly, updateUser);
router.delete('/:id', protect, adminOnly, deleteUser);

module.exports = router;
