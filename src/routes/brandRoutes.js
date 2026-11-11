const express = require('express');
const router = express.Router();
const {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand
} = require('../controllers/brandController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/', getBrands);
router.get('/:id', getBrandById);
router.post('/', protect, adminOnly, createBrand);
router.put('/:id', protect, adminOnly, updateBrand);
router.delete('/:id', protect, adminOnly, deleteBrand);

module.exports = router;
