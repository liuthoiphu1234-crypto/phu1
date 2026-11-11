const User = require('../models/User');
const Order = require('../models/Order');

// [GET] /api/users - Danh sách khách hàng kèm số đơn và tổng chi tiêu
exports.getUsers = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const filter = {};

    if (role) {
      filter.role = role;
    }

    if (status === 'blocked') {
      filter.isBlocked = true;
    } else if (status === 'active') {
      filter.isBlocked = false;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    // Lấy thống kê đơn hàng cho từng người dùng dựa trên email hoặc sđt
    const orders = await Order.find().select('customerEmail customerPhone totalAmount orderStatus');

    const enrichedUsers = users.map((u) => {
      const userOrders = orders.filter(
        (o) =>
          (o.customerEmail && o.customerEmail.toLowerCase() === u.email.toLowerCase()) ||
          (o.customerPhone && u.phone && o.customerPhone === u.phone)
      );

      const totalSpent = userOrders
        .filter((o) => o.orderStatus !== 'CANCELLED')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      const completedOrders = userOrders.filter((o) => o.orderStatus === 'COMPLETED').length;
      const cancelledOrders = userOrders.filter((o) => o.orderStatus === 'CANCELLED').length;
      const processingOrders = userOrders.length - completedOrders - cancelledOrders;

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        address: u.address,
        avatar: u.avatar,
        role: u.role,
        isBlocked: u.isBlocked,
        createdAt: u.createdAt,
        totalOrders: userOrders.length,
        totalSpent,
        completedOrders,
        cancelledOrders,
        processingOrders
      };
    });

    res.status(200).json({
      success: true,
      total: enrichedUsers.length,
      data: enrichedUsers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [GET] /api/users/stats - Thống kê khách hàng
exports.getCustomerStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const blockedCount = await User.countDocuments({ isBlocked: true });
    const activeCount = totalCustomers - blockedCount;

    // Khách mới trong tháng hiện tại
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newThisMonth = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: startOfMonth }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalCustomers,
        activeCount,
        blockedCount,
        newThisMonth
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [GET] /api/users/:id - Xem chi tiết khách hàng và lịch sử đơn hàng
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khách hàng!'
      });
    }

    const orders = await Order.find({
      $or: [
        { customerEmail: user.email },
        { customerPhone: user.phone || '___none___' }
      ]
    }).sort({ createdAt: -1 });

    const totalSpent = orders
      .filter((o) => o.orderStatus !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        user,
        orders,
        stats: {
          totalOrders: orders.length,
          totalSpent,
          completedOrders: orders.filter((o) => o.orderStatus === 'COMPLETED').length,
          cancelledOrders: orders.filter((o) => o.orderStatus === 'CANCELLED').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [PUT] /api/users/:id/toggle-block - Khóa hoặc mở khóa tài khoản
exports.toggleBlockUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản!'
      });
    }

    if (targetUser.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không thể khóa tài khoản Quản trị viên (Admin)!'
      });
    }

    targetUser.isBlocked = !targetUser.isBlocked;
    await targetUser.save();

    res.status(200).json({
      success: true,
      message: targetUser.isBlocked
        ? `Đã khóa tài khoản khách hàng [${targetUser.name}]`
        : `Đã mở khóa tài khoản khách hàng [${targetUser.name}]`,
      data: {
        _id: targetUser._id,
        isBlocked: targetUser.isBlocked
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [PUT] /api/users/:id - Cập nhật thông tin khách hàng
exports.updateUser = async (req, res) => {
  try {
    const { name, phone, address, role } = req.body;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản!'
      });
    }

    if (name) targetUser.name = name;
    if (phone !== undefined) targetUser.phone = phone;
    if (address !== undefined) targetUser.address = address;
    if (role && (role === 'customer' || role === 'admin')) {
      targetUser.role = role;
    }

    await targetUser.save();

    res.status(200).json({
      success: true,
      message: 'Cập nhật tài khoản thành công',
      data: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        address: targetUser.address,
        role: targetUser.role,
        isBlocked: targetUser.isBlocked
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// [DELETE] /api/users/:id - Xóa tài khoản khách hàng an toàn
exports.deleteUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản!'
      });
    }

    if (targetUser.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Không được phép xóa tài khoản Quản trị viên (Admin)!'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Đã xóa tài khoản khách hàng thành công!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
