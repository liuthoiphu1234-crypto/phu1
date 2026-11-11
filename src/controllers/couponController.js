const Coupon = require('../models/Coupon');

// [GET] /api/coupons - Danh sách mã giảm giá
exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      total: coupons.length,
      data: coupons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [POST] /api/coupons/apply - Khách hàng áp dụng mã giảm giá khi thanh toán
exports.applyCoupon = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã giảm giá!'
      });
    }

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Mã giảm giá không tồn tại hoặc đã hết hiệu lực!'
      });
    }

    if (new Date() > new Date(coupon.expiryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá này đã hết hạn sử dụng!'
      });
    }

    const total = Number(orderTotal || 0);
    if (coupon.minOrderValue && total < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Đơn hàng tối thiểu phải từ ${coupon.minOrderValue.toLocaleString('vi-VN')} đ để áp dụng mã này!`
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'PERCENT') {
      discountAmount = Math.round((total * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    if (discountAmount > total) {
      discountAmount = total;
    }

    res.status(200).json({
      success: true,
      message: `Áp dụng mã [${coupon.code}] thành công!`,
      data: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        finalTotal: total - discountAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [POST] /api/coupons - Tạo mã giảm giá mới (Admin)
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscountAmount,
      usageLimit,
      expiryDate
    } = req.body;

    if (!code || !discountValue || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mã code, giá trị giảm và ngày hết hạn!'
      });
    }

    const exists = await Coupon.findOne({ code: code.trim().toUpperCase() });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Mã giảm giá này đã tồn tại!'
      });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      description: description || '',
      discountType: discountType || 'PERCENT',
      discountValue: Number(discountValue),
      minOrderValue: Number(minOrderValue || 0),
      maxDiscountAmount: Number(maxDiscountAmount || 500000),
      usageLimit: Number(usageLimit || 1000),
      expiryDate: new Date(expiryDate)
    });

    res.status(201).json({
      success: true,
      message: 'Tạo mã giảm giá mới thành công',
      data: coupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [PUT] /api/coupons/:id - Cập nhật mã giảm giá (Admin)
exports.updateCoupon = async (req, res) => {
  try {
    const updated = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã giảm giá!'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Cập nhật mã giảm giá thành công',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [DELETE] /api/coupons/:id - Xóa mã giảm giá (Admin)
exports.deleteCoupon = async (req, res) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy mã giảm giá để xóa!'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Đã xóa mã giảm giá thành công!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
