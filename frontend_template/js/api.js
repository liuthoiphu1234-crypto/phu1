/**
 * ==========================================================
 * CẤU HÌNH KẾT NỐI API BACKEND CHO BLUSHÉ BEAUTY E-COMMERCE
 * Tự động thích ứng thông minh đa môi trường:
 * 1. Chạy trên Render.com -> dùng '/api'
 * 2. Chạy trên localhost cổng 5000 -> dùng '/api'
 * 3. Chạy trên Live Server (5500, 5501...) hoặc file HTML cục bộ -> Tự động kết nối Cloud Backend Render đang hoạt động
 * ==========================================================
 */
const RENDER_ONLINE_API = 'https://phu1-2.onrender.com/api';

const API_BASE_URL = (() => {
  if (typeof window === 'undefined') return 'http://localhost:5000/api';
  
  // 1. Đang truy cập trực tiếp trên Render
  if (window.location.hostname.includes('onrender.com')) {
    return '/api';
  }
  // 2. Đang chạy từ Node.js server local port 5000
  if (window.location.port === '5000') {
    return '/api';
  }
  // 3. Mở từ Live Server (cổng 5500, 5501...) hoặc file máy tính:
  // Kết nối trực tiếp tới máy chủ Cloud Render để đảm bảo 100% luôn hoạt động kể cả khi chưa bật port 5000 ở local
  return RENDER_ONLINE_API;
})();

const API = {
  // 1. DANH MỤC (CATEGORIES)
  async getCategories() {
    try {
      const res = await fetch(`${API_BASE_URL}/categories`);
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy danh mục:', err);
      return { success: false, data: [] };
    }
  },

  async createCategory(catData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(catData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateCategory(id, catData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(catData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteCategory(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 2. THƯƠNG HIỆU (BRANDS)
  async getBrands() {
    try {
      const res = await fetch(`${API_BASE_URL}/brands`);
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy thương hiệu:', err);
      return { success: false, data: [] };
    }
  },

  async createBrand(brandData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/brands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(brandData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateBrand(id, brandData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(brandData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteBrand(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 3. SẢN PHẨM (PRODUCTS)
  async getProducts(params = {}) {
    try {
      const query = new URLSearchParams();
      if (params.category) query.append('category', params.category);
      if (params.brand) query.append('brand', params.brand);
      if (params.skinType) query.append('skinType', params.skinType);
      if (params.search) query.append('search', params.search);
      if (params.minPrice) query.append('minPrice', params.minPrice);
      if (params.maxPrice) query.append('maxPrice', params.maxPrice);
      if (params.sort) query.append('sort', params.sort);
      if (params.isFeatured) query.append('isFeatured', params.isFeatured);
      if (params.isBestSeller) query.append('isBestSeller', params.isBestSeller);
      if (params.isNewArrival) query.append('isNewArrival', params.isNewArrival);

      const url = `${API_BASE_URL}/products${query.toString() ? '?' + query.toString() : ''}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy sản phẩm:', err);
      return { success: false, data: [] };
    }
  },

  async getProductById(id) {
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}`);
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy chi tiết sản phẩm:', err);
      return { success: false, message: 'Lỗi kết nối máy chủ' };
    }
  },

  async createProduct(productData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productData)
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi thêm sản phẩm:', err);
      return { success: false, message: err.message };
    }
  },

  async updateProduct(id, productData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteProduct(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi xóa sản phẩm:', err);
      return { success: false, message: err.message };
    }
  },

  // 4. XÁC THỰC VÀ TÀI KHOẢN (AUTH)
  async login(email, password) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi đăng nhập:', err);
      return { success: false, message: 'Không thể kết nối đến máy chủ API' };
    }
  },

  async register(userData) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi đăng ký:', err);
      return { success: false, message: 'Không thể kết nối đến máy chủ API' };
    }
  },

  async getMe(token) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateProfile(profileData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async changePassword(passwordData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(passwordData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 5. QUẢN LÝ KHÁCH HÀNG (CUSTOMER MANAGEMENT FOR ADMIN - MỤC VI.6)
  async getUsers(params = {}, token) {
    try {
      const query = new URLSearchParams();
      if (params.search) query.append('search', params.search);
      if (params.role) query.append('role', params.role);
      if (params.status) query.append('status', params.status);

      const url = `${API_BASE_URL}/users${query.toString() ? '?' + query.toString() : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy danh sách khách hàng:', err);
      return { success: false, data: [] };
    }
  },

  async getUserById(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async toggleBlockUser(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${id}/toggle-block`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateUser(id, userData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteUser(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getCustomerStats(token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, data: {} };
    }
  },

  // 6. ĐƠN HÀNG (ORDERS)
  async createOrder(orderData) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi đặt hàng:', err);
      return { success: false, message: err.message };
    }
  },

  async getOrders(token) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/orders`, { headers });
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy đơn hàng:', err);
      return { success: false, data: [] };
    }
  },

  async getOrderById(id) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${id}`);
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateOrderStatus(id, status, paymentStatus, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, paymentStatus })
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi cập nhật đơn hàng:', err);
      return { success: false, message: err.message };
    }
  },

  // 7. THANH TOÁN QR (VIETQR / MOMO QR)
  async createPaymentQR(orderId, paymentMethod) {
    try {
      const res = await fetch(`${API_BASE_URL}/payment/create-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentMethod })
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi tạo mã thanh toán QR:', err);
      return { success: false, message: err.message };
    }
  },

  async confirmPayment(orderId) {
    try {
      const res = await fetch(`${API_BASE_URL}/payment/confirm-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 8. MÃ GIẢM GIÁ (COUPONS)
  async getCoupons(token) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/coupons`, { headers });
      return await res.json();
    } catch (err) {
      return { success: false, data: [] };
    }
  },

  async applyCoupon(code, orderTotal) {
    try {
      const res = await fetch(`${API_BASE_URL}/coupons/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderTotal })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async createCoupon(couponData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(couponData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateCoupon(id, couponData, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/coupons/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(couponData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteCoupon(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/coupons/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 9. ĐÁNH GIÁ (REVIEWS)
  async getReviews(token) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/reviews`, { headers });
      return await res.json();
    } catch (err) {
      return { success: false, data: [] };
    }
  },

  async getReviewsByProduct(productId) {
    try {
      const res = await fetch(`${API_BASE_URL}/reviews/product/${productId}`);
      return await res.json();
    } catch (err) {
      return { success: false, data: [] };
    }
  },

  async createReview(reviewData) {
    try {
      const res = await fetch(`${API_BASE_URL}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async toggleApproveReview(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/reviews/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteReview(id, token) {
    try {
      const res = await fetch(`${API_BASE_URL}/reviews/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 10. VẬN CHUYỂN (SHIPPING)
  async calculateShipping(province, orderTotal) {
    try {
      const res = await fetch(`${API_BASE_URL}/shipping/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ province, orderTotal })
      });
      return await res.json();
    } catch (err) {
      return {
        success: true,
        data: { shippingFee: 25000, estimatedDays: '2-3 ngày', isFree: false }
      };
    }
  },

  // 11. BÁO CÁO VÀ THỐNG KÊ DASHBOARD (ANALYTICS)
  async getDashboardAnalytics(token) {
    try {
      const res = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi lấy thống kê dashboard:', err);
      return { success: false, message: err.message };
    }
  },

  // 12. TRỢ LÝ AI GEMINI & BLUSHÉ BEAUTY SMART ENGINE
  async askAI(message, history = []) {
    try {
      const token = localStorage.getItem('BLUSHE_TOKEN');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, token, history })
      });
      return await res.json();
    } catch (err) {
      console.error('Lỗi gọi AI Chatbot:', err);
      return {
        success: false,
        reply: 'Hệ thống trợ lý Blushé Beauty đang bận hoặc chưa khởi động máy chủ. Bạn vui lòng thử lại sau nhé!'
      };
    }
  }
};
