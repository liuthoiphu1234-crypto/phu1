require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const aiRoutes = require("./routes/aiRoutes");
const shippingRoutes = require("./routes/shippingRoutes");

// Các tuyến API bổ sung cho hệ sinh thái Blushé Beauty
const userRoutes = require("./routes/userRoutes");
const brandRoutes = require("./routes/brandRoutes");
const couponRoutes = require("./routes/couponRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Kết nối MongoDB Atlas
connectDB();

// 2. Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Hệ sinh thái E-Commerce Blushé Beauty hoạt động ổn định!",
    timestamp: new Date()
  });
});

// 4. Định tuyến API
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/shipping", shippingRoutes);

// Định tuyến API bổ sung
app.use("/api/users", userRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/analytics", analyticsRoutes);

// 5. Bắt lỗi 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Đường dẫn [${req.method}] ${req.originalUrl} không tồn tại!`,
  });
});

// 6. Khởi chạy Server
app.listen(PORT, () => {
  console.log("====================================================");
  console.log(`🌸 Blushé Beauty Backend Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`🛒 Test Đặt hàng: POST http://localhost:${PORT}/api/orders`);
  console.log(`📋 Test Danh sách đơn: GET http://localhost:${PORT}/api/orders`);
  console.log(`✨ Báo cáo Quản trị: GET http://localhost:${PORT}/api/analytics/dashboard`);
  console.log("====================================================");
});
