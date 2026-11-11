const Brand = require('../models/Brand');

// [GET] /api/brands - Danh sách thương hiệu
exports.getBrands = async (req, res) => {
  try {
    const brands = await Brand.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      total: brands.length,
      data: brands
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [GET] /api/brands/:id - Chi tiết thương hiệu
exports.getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thương hiệu!'
      });
    }
    res.status(200).json({
      success: true,
      data: brand
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [POST] /api/brands - Tạo thương hiệu mới (Admin)
exports.createBrand = async (req, res) => {
  try {
    const { name, origin, description, logo } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tên thương hiệu!'
      });
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const brand = await Brand.create({
      name,
      slug,
      origin: origin || 'Pháp',
      description: description || '',
      logo: logo || ''
    });

    res.status(201).json({
      success: true,
      message: 'Thêm thương hiệu mới thành công',
      data: brand
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [PUT] /api/brands/:id - Cập nhật thương hiệu (Admin)
exports.updateBrand = async (req, res) => {
  try {
    const updated = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thương hiệu!'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Cập nhật thương hiệu thành công',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [DELETE] /api/brands/:id - Xóa thương hiệu (Admin)
exports.deleteBrand = async (req, res) => {
  try {
    const deleted = await Brand.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thương hiệu để xóa!'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Đã xóa thương hiệu thành công!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
