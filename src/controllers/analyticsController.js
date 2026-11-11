const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');

// [GET] /api/analytics/dashboard - Thống kê thực tế từ CSDL MongoDB Atlas
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const [orders, products, users] = await Promise.all([
      Order.find().sort({ createdAt: -1 }),
      Product.find().populate('category', 'name'),
      User.find().select('-password')
    ]);

    // 1. Chỉ số tổng hợp
    const totalOrders = orders.length;
    const totalProducts = products.length;
    const totalCustomers = users.filter((u) => u.role === 'customer').length;

    // Doanh thu tính trên các đơn không bị hủy
    const validOrders = orders.filter((o) => o.orderStatus !== 'CANCELLED');
    const totalRevenue = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // 2. Thống kê theo trạng thái đơn hàng
    const ordersByStatus = {
      PENDING: orders.filter((o) => o.orderStatus === 'PENDING').length,
      CONFIRMED: orders.filter((o) => o.orderStatus === 'CONFIRMED').length,
      SHIPPING: orders.filter((o) => o.orderStatus === 'SHIPPING').length,
      COMPLETED: orders.filter((o) => o.orderStatus === 'COMPLETED').length,
      CANCELLED: orders.filter((o) => o.orderStatus === 'CANCELLED').length
    };

    // 3. Thống kê kho hàng
    const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= 10);
    const outOfStockProducts = products.filter((p) => p.stock <= 0);

    // 4. Doanh thu theo tháng (12 tháng gần nhất)
    const monthlyRevenue = {};
    const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    months.forEach((m) => (monthlyRevenue[m] = 0));

    validOrders.forEach((o) => {
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        const mKey = `T${d.getMonth() + 1}`;
        if (monthlyRevenue[mKey] !== undefined) {
          monthlyRevenue[mKey] += o.totalAmount || 0;
        }
      }
    });

    // 5. Top sản phẩm bán chạy nhất (tính từ các đơn hàng)
    const productSalesMap = {};
    validOrders.forEach((o) => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item) => {
          const pId = String(item.productId || item.name);
          if (!productSalesMap[pId]) {
            productSalesMap[pId] = {
              name: item.name,
              totalQuantity: 0,
              totalRevenue: 0
            };
          }
          productSalesMap[pId].totalQuantity += item.quantity || 1;
          productSalesMap[pId].totalRevenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    });

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    // 6. Top khách hàng VIP (chi tiêu cao nhất)
    const customerSpendingMap = {};
    validOrders.forEach((o) => {
      const email = o.customerEmail || 'Ẩn danh';
      if (!customerSpendingMap[email]) {
        customerSpendingMap[email] = {
          name: o.customerName || 'Khách hàng',
          email: email,
          phone: o.customerPhone || '',
          orderCount: 0,
          totalSpent: 0
        };
      }
      customerSpendingMap[email].orderCount += 1;
      customerSpendingMap[email].totalSpent += o.totalAmount || 0;
    });

    const topCustomers = Object.values(customerSpendingMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    // 7. Hoạt động gần đây (5 đơn hàng mới nhất)
    const recentOrders = orders.slice(0, 7).map((o) => ({
      _id: o._id,
      orderCode: o.orderCode || o._id.toString().slice(-6).toUpperCase(),
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      totalAmount: o.totalAmount,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt
    }));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          totalProducts,
          totalCustomers,
          lowStockCount: lowStockProducts.length,
          outOfStockCount: outOfStockProducts.length
        },
        ordersByStatus,
        monthlyRevenue,
        topSellingProducts,
        topCustomers,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
