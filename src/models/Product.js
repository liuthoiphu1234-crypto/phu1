const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên sản phẩm không được để trống'],
      trim: true
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Sản phẩm phải thuộc về một danh mục']
    },
    brand: {
      type: String,
      default: 'Blushé Naturals',
      trim: true
    },
    originalPrice: {
      type: Number,
      required: [true, 'Giá gốc không được để trống'],
      min: [0, 'Giá tiền không được nhỏ hơn 0']
    },
    salePrice: {
      type: Number,
      required: [true, 'Giá bán không được để trống'],
      min: [0, 'Giá tiền không được nhỏ hơn 0']
    },
    stock: {
      type: Number,
      default: 10,
      min: [0, 'Số lượng kho không thể âm']
    },
    image: {
      type: String,
      default: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'
    },
    description: {
      type: String,
      default: ''
    },
    ingredients: {
      type: String,
      default: 'Chiết xuất thực vật hữu cơ, Niacinamide, Hyaluronic Acid, Vitamin E.'
    },
    usage: {
      type: String,
      default: 'Làm sạch da, lấy lượng vừa đủ thoa đều và massage nhẹ nhàng vào mỗi buổi sáng và tối.'
    },
    skinType: {
      type: String,
      default: 'Mọi loại da',
      trim: true
    },
    volume: {
      type: String,
      default: '50ml',
      trim: true
    },
    origin: {
      type: String,
      default: 'Pháp',
      trim: true
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 1,
      max: 5
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    isBestSeller: {
      type: Boolean,
      default: false
    },
    isNewArrival: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Product', productSchema);
