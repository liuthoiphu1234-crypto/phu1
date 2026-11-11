const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Mã giảm giá không được để trống'],
      unique: true,
      uppercase: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    discountType: {
      type: String,
      enum: ['PERCENT', 'FIXED'],
      default: 'PERCENT'
    },
    discountValue: {
      type: Number,
      required: [true, 'Giá trị giảm không được để trống'],
      min: 0
    },
    minOrderValue: {
      type: Number,
      default: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: 500000
    },
    usageLimit: {
      type: Number,
      default: 1000
    },
    usedCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    expiryDate: {
      type: Date,
      required: [true, 'Ngày hết hạn không được để trống']
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Coupon', couponSchema);
