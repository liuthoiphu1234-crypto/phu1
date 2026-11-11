const Review = require('../models/Review');

// [GET] /api/reviews - Lấy tất cả đánh giá (Admin)
exports.getReviews = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('product', 'name image')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: reviews.length,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [GET] /api/reviews/product/:productId - Lấy đánh giá của 1 sản phẩm
exports.getReviewsByProduct = async (req, res) => {
  try {
    const reviews = await Review.find({
      product: req.params.productId,
      isApproved: true
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: reviews.length,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [POST] /api/reviews - Khách gửi đánh giá
exports.createReview = async (req, res) => {
  try {
    const { productId, customerName, customerEmail, rating, comment } = req.body;
    if (!productId || !customerName || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ họ tên, số sao và nội dung nhận xét!'
      });
    }

    const review = await Review.create({
      product: productId,
      customerName,
      customerEmail: customerEmail || 'khachhang@gmail.com',
      rating: Number(rating),
      comment,
      isApproved: true
    });

    res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã gửi đánh giá cho Blushé Beauty!',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [PUT] /api/reviews/:id/toggle - Ẩn/hiện đánh giá (Admin)
exports.toggleApproveReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá!'
      });
    }

    review.isApproved = !review.isApproved;
    await review.save();

    res.status(200).json({
      success: true,
      message: review.isApproved ? 'Đã hiển thị đánh giá' : 'Đã ẩn đánh giá',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [DELETE] /api/reviews/:id - Xóa đánh giá (Admin)
exports.deleteReview = async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá để xóa!'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Đã xóa đánh giá thành công!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
