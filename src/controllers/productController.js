const Product = require('../models/Product');

// [GET] /api/products - Lấy danh sách sản phẩm (Lọc danh mục, thương hiệu, loại da, tìm kiếm, sắp xếp)
exports.getProducts = async (req, res) => {
  try {
    const { category, brand, skinType, search, minPrice, maxPrice, sort, isFeatured, isBestSeller, isNewArrival } = req.query;

    const filter = {};

    // 1. Lọc theo danh mục
    if (category) {
      filter.category = category;
    }

    // 2. Lọc theo thương hiệu
    if (brand) {
      filter.brand = { $regex: brand, $options: 'i' };
    }

    // 3. Lọc theo loại da
    if (skinType) {
      filter.skinType = { $regex: skinType, $options: 'i' };
    }

    // 4. Lọc cờ đặc biệt
    if (isFeatured === 'true') filter.isFeatured = true;
    if (isBestSeller === 'true') filter.isBestSeller = true;
    if (isNewArrival === 'true') filter.isNewArrival = true;

    // 5. Tìm kiếm theo tên hoặc thương hiệu
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // 6. Lọc theo khoảng giá
    if (minPrice || maxPrice) {
      filter.salePrice = {};
      if (minPrice) filter.salePrice.$gte = Number(minPrice);
      if (maxPrice) filter.salePrice.$lte = Number(maxPrice);
    }

    // 7. Sắp xếp
    let sortQuery = { createdAt: -1 };
    if (sort === 'price_asc') {
      sortQuery = { salePrice: 1 };
    } else if (sort === 'price_desc') {
      sortQuery = { salePrice: -1 };
    } else if (sort === 'rating_desc') {
      sortQuery = { rating: -1 };
    } else if (sort === 'best_seller') {
      sortQuery = { isBestSeller: -1, rating: -1 };
    } else if (sort === 'newest') {
      sortQuery = { createdAt: -1 };
    }

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortQuery);

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách sản phẩm thành công',
      total: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// [GET] /api/products/:id - Lấy chi tiết 1 sản phẩm kèm gợi ý sản phẩm liên quan
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      'category',
      'name slug'
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm yêu cầu!',
      });
    }

    // Lấy 4 sản phẩm liên quan cùng danh mục
    const related = await Product.find({
      category: product.category ? product.category._id : null,
      _id: { $ne: product._id }
    }).limit(4);

    res.status(200).json({
      success: true,
      message: 'Lấy chi tiết sản phẩm thành công',
      data: product,
      related
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// [POST] /api/products - Thêm sản phẩm mới
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      brand,
      originalPrice,
      salePrice,
      stock,
      image,
      description,
      ingredients,
      usage,
      skinType,
      volume,
      origin,
      isFeatured,
      isBestSeller,
      isNewArrival
    } = req.body;

    if (!name || !category || !originalPrice || !salePrice) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ: Tên sản phẩm, Danh mục, Giá gốc và Giá bán!',
      });
    }

    const newProduct = await Product.create({
      name,
      category,
      brand: brand || 'Blushé Naturals',
      originalPrice: Number(originalPrice),
      salePrice: Number(salePrice),
      stock: Number(stock !== undefined ? stock : 10),
      image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
      description: description || '',
      ingredients: ingredients || 'Chiết xuất thực vật hữu cơ tự nhiên, cấp ẩm sâu, an toàn cho làn da.',
      usage: usage || 'Sử dụng hàng ngày vào buổi sáng và tối sau bước làm sạch.',
      skinType: skinType || 'Mọi loại da',
      volume: volume || '50ml',
      origin: origin || 'Pháp',
      isFeatured: isFeatured === true || isFeatured === 'true',
      isBestSeller: isBestSeller === true || isBestSeller === 'true',
      isNewArrival: isNewArrival === true || isNewArrival === 'true'
    });

    const populated = await Product.findById(newProduct._id).populate('category', 'name slug');

    res.status(201).json({
      success: true,
      message: 'Thêm sản phẩm mới thành công',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// [PUT] /api/products/:id - Cập nhật sản phẩm
exports.updateProduct = async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('category', 'name slug');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm để cập nhật!',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật sản phẩm thành công',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// [DELETE] /api/products/:id - Xóa sản phẩm
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm để xóa!',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Đã xóa sản phẩm thành công',
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
