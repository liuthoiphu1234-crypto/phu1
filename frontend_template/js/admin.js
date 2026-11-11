/* ==========================================================
   BLUSHÉ BEAUTY - BẢNG ĐIỀU KHIỂN QUẢN TRỊ ADMIN (JAVASCRIPT)
   Đồng bộ dữ liệu thời gian thực từ MongoDB Atlas
   ========================================================== */

let adminToken = localStorage.getItem("BLUSHE_TOKEN") || "";
let currentAdmin = JSON.parse(localStorage.getItem("BLUSHE_USER") || "null");

// Dữ liệu bộ nhớ tạm cho Admin
let adminData = {
  analytics: null,
  customers: [],
  products: [],
  categories: [],
  brands: [],
  orders: [],
  coupons: [],
  reviews: []
};

// 1. KHỞI TẠO KHI TẢI TRANG
document.addEventListener("DOMContentLoaded", async () => {
  await ensureAdminAuth();
  await loadAllAdminData();
});

// 2. XÁC THỰC QUYỀN ADMIN
async function ensureAdminAuth() {
  if (!adminToken || !currentAdmin || currentAdmin.role !== "admin") {
    // Tự động hỗ trợ đăng nhập Admin với tài khoản đã seed
    try {
      let res = await API.login("admin@blushe.vn", "admin123");
      if (!res.success) {
        res = await API.login("admin@lhu.edu.vn", "123456");
      }
      if (res.success && res.token && res.user.role === "admin") {
        adminToken = res.token;
        currentAdmin = res.user;
        localStorage.setItem("BLUSHE_TOKEN", adminToken);
        localStorage.setItem("BLUSHE_USER", JSON.stringify(currentAdmin));
      } else {
        const loginEmail = prompt("Vui lòng nhập Email Quản Trị Viên:", "admin@blushe.vn");
        const loginPass = prompt("Vui lòng nhập Mật Khẩu Admin:", "admin123");
        if (loginEmail && loginPass) {
          const authRes = await API.login(loginEmail, loginPass);
          if (authRes.success && authRes.token) {
            adminToken = authRes.token;
            currentAdmin = authRes.user;
            localStorage.setItem("BLUSHE_TOKEN", adminToken);
            localStorage.setItem("BLUSHE_USER", JSON.stringify(currentAdmin));
          } else {
            alert("Đăng nhập thất bại: " + authRes.message);
            window.location.href = "index.html";
            return;
          }
        } else {
          window.location.href = "index.html";
          return;
        }
      }
    } catch (err) {
      console.error("Lỗi xác thực Admin:", err);
    }
  }

  // Cập nhật thông tin trên thanh Topbar
  if (currentAdmin) {
    const nameEl = document.getElementById("adminCurrentName");
    const avatarEl = document.getElementById("adminAvatarLetter");
    if (nameEl) nameEl.innerText = currentAdmin.name || "Quản Trị Viên";
    if (avatarEl && currentAdmin.name) avatarEl.innerText = currentAdmin.name[0].toUpperCase();
  }
}

function handleAdminLogout() {
  if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi Cổng Quản Trị Admin không?")) {
    localStorage.removeItem("BLUSHE_TOKEN");
    localStorage.removeItem("BLUSHE_USER");
    window.location.href = "index.html";
  }
}

// 3. CHUYỂN ĐỔI TAB QUẢN TRỊ
function switchAdminTab(tabId, element) {
  document.querySelectorAll(".admin-tab-pane").forEach((p) => (p.style.display = "none"));
  document.querySelectorAll(".menu-item").forEach((m) => m.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.style.display = "block";
  if (element) element.classList.add("active");
}

// 4. TIỆN ÍCH ĐỊNH DẠNG
function formatMoney(amount) {
  return `${Number(amount || 0).toLocaleString("vi-VN")} đ`;
}

function escapeStr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 5. TẢI ĐỒNG BỘ TẤT CẢ DỮ LIỆU TỪ MONGODB ATLAS
async function loadAllAdminData() {
  try {
    const [analyticsRes, usersRes, prodsRes, catsRes, brandsRes, ordersRes, couponsRes, reviewsRes] = await Promise.all([
      API.getDashboardAnalytics(adminToken),
      API.getUsers({}, adminToken),
      API.getProducts(),
      API.getCategories(),
      API.getBrands(),
      API.getOrders(adminToken),
      API.getCoupons(adminToken),
      API.getReviews(adminToken)
    ]);

    if (analyticsRes.success) adminData.analytics = analyticsRes.data;
    if (usersRes.success) adminData.customers = usersRes.data || [];
    if (prodsRes.success) adminData.products = prodsRes.data || [];
    if (catsRes.success) adminData.categories = catsRes.data || [];
    if (brandsRes.success) adminData.brands = brandsRes.data || [];
    if (ordersRes.success) adminData.orders = ordersRes.data || [];
    if (couponsRes.success) adminData.coupons = couponsRes.data || [];
    if (reviewsRes.success) adminData.reviews = reviewsRes.data || [];

    // Cập nhật các huy hiệu (badges) trên sidebar
    document.getElementById("badgeCustomerCount").innerText = adminData.customers.length;
    document.getElementById("badgeOrderCount").innerText = adminData.orders.length;
    document.getElementById("badgeProductCount").innerText = adminData.products.length;

    // Render từng phân hệ
    renderDashboard();
    renderCustomersTable();
    renderProductsTable();
    renderCategoriesTable();
    renderBrandsTable();
    renderOrdersTable();
    renderCouponsTable();
    renderReviewsTable();
    renderInventoryTable();
    renderReports();
  } catch (error) {
    console.error("Lỗi tải dữ liệu Admin:", error);
  }
}

// ==========================================================
// 6. RENDER DASHBOARD TỔNG QUAN (SỐ LIỆU THẬT)
// ==========================================================
function renderDashboard() {
  const d = adminData.analytics;
  if (!d) return;

  // 4 Chỉ số đầu trang
  document.getElementById("statTotalRevenue").innerText = formatMoney(d.summary.totalRevenue);
  document.getElementById("statTotalOrders").innerText = d.summary.totalOrders;
  document.getElementById("statTotalCustomers").innerText = d.summary.totalCustomers;
  document.getElementById("statTotalProducts").innerText = d.summary.totalProducts;

  // Biểu đồ doanh thu 12 tháng
  const chartEl = document.getElementById("monthlyRevenueChart");
  if (chartEl && d.monthlyRevenue) {
    const months = Object.keys(d.monthlyRevenue);
    const maxVal = Math.max(...Object.values(d.monthlyRevenue), 1000000);

    chartEl.innerHTML = months.map((m) => {
      const val = d.monthlyRevenue[m] || 0;
      const pct = Math.max(8, Math.round((val / maxVal) * 100));
      return `
        <div class="chart-col">
          <div class="chart-bar" style="height:${pct}%;" data-tooltip="${m}: ${formatMoney(val)}"></div>
          <span class="chart-label">${m}</span>
        </div>
      `;
    }).join("");
  }

  // Tình trạng đơn hàng
  const statusEl = document.getElementById("orderStatusBreakdown");
  if (statusEl && d.ordersByStatus) {
    const s = d.ordersByStatus;
    const total = d.summary.totalOrders || 1;
    const statusMap = [
      { key: "PENDING", label: "Chờ duyệt", count: s.PENDING || 0, color: "#D9822B" },
      { key: "CONFIRMED", label: "Đã xác nhận", count: s.CONFIRMED || 0, color: "#2B6CB0" },
      { key: "SHIPPING", label: "Đang giao", count: s.SHIPPING || 0, color: "#6B46C1" },
      { key: "COMPLETED", label: "Hoàn tất", count: s.COMPLETED || 0, color: "#276749" },
      { key: "CANCELLED", label: "Đã hủy", count: s.CANCELLED || 0, color: "#9B1C1C" }
    ];

    statusEl.innerHTML = statusMap.map((item) => `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span><strong>${item.label}</strong> (${item.key})</span>
          <span>${item.count} đơn (${Math.round((item.count / total) * 100)}%)</span>
        </div>
        <div style="width:100%;height:6px;background:var(--admin-bg);border-radius:3px;overflow:hidden;">
          <div style="width:${(item.count / total) * 100}%;height:100%;background:${item.color};"></div>
        </div>
      </div>
    `).join("");
  }

  // Top sản phẩm bán chạy
  const topProdEl = document.getElementById("topSellingProductsList");
  if (topProdEl && d.topSellingProducts) {
    if (d.topSellingProducts.length === 0) {
      topProdEl.innerHTML = `<div style="color:var(--admin-muted);font-size:12.5px;">Chưa có dữ liệu bán hàng.</div>`;
    } else {
      topProdEl.innerHTML = d.topSellingProducts.map((p, idx) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--admin-border);font-size:12.5px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-weight:700;color:var(--admin-accent);width:20px;">#${idx + 1}</span>
            <div>
              <div style="font-weight:600;">${escapeStr(p.name)}</div>
              <div style="font-size:11px;color:var(--admin-muted);">Đã bán: <strong>${p.totalQuantity}</strong> món</div>
            </div>
          </div>
          <strong style="color:var(--admin-accent);">${formatMoney(p.totalRevenue)}</strong>
        </div>
      `).join("");
    }
  }

  // Top Khách hàng VIP
  const topCustEl = document.getElementById("topCustomersList");
  if (topCustEl && d.topCustomers) {
    if (d.topCustomers.length === 0) {
      topCustEl.innerHTML = `<div style="color:var(--admin-muted);font-size:12.5px;">Chưa có dữ liệu mua sắm.</div>`;
    } else {
      topCustEl.innerHTML = d.topCustomers.map((c, idx) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--admin-border);font-size:12.5px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--admin-sage);color:var(--admin-accent);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;">
              ${c.name[0] ? c.name[0].toUpperCase() : "U"}
            </div>
            <div>
              <div style="font-weight:600;">${escapeStr(c.name)}</div>
              <div style="font-size:11px;color:var(--admin-muted);">${escapeStr(c.email)} • ${c.orderCount} đơn</div>
            </div>
          </div>
          <strong style="color:var(--admin-accent);">${formatMoney(c.totalSpent)}</strong>
        </div>
      `).join("");
    }
  }
}

// ==========================================================
// 7. QUẢN LÝ KHÁCH HÀNG (MỤC VI.6 - TRỌNG TÂM 20% ĐIỂM DỰ ÁN)
// ==========================================================
function renderCustomersTable() {
  const tbody = document.getElementById("customersTableBody");
  const countEl = document.getElementById("custFilteredCount");
  if (!tbody) return;

  const list = adminData.customers;

  // Thống kê nhanh
  const total = list.length;
  const blocked = list.filter((u) => u.isBlocked).length;
  const active = total - blocked;
  document.getElementById("custStatTotal").innerText = total;
  document.getElementById("custStatActive").innerText = active;
  document.getElementById("custStatBlocked").innerText = blocked;
  document.getElementById("custStatNew").innerText = list.filter((u) => {
    const d = new Date(u.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  if (countEl) countEl.innerText = total;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;">Không có khách hàng nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((u) => {
    const code = "KH" + (u._id ? u._id.slice(-6).toUpperCase() : "000");
    const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi-VN") : "-";
    const isLocked = u.isBlocked === true;

    return `
      <tr>
        <td><strong>#${code}</strong></td>
        <td>
          <div style="font-weight:600;">${escapeStr(u.name)}</div>
          <div style="font-size:10.5px;color:var(--admin-muted);">${u.role === "admin" ? "🛡️ Quản trị viên" : "🛍️ Khách hàng"}</div>
        </td>
        <td>${escapeStr(u.email)}</td>
        <td>${escapeStr(u.phone || "Chưa có")}</td>
        <td>${createdDate}</td>
        <td><strong>${u.totalOrders || 0}</strong> đơn</td>
        <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(u.totalSpent || 0)}</td>
        <td>
          <span class="badge-status ${isLocked ? "status-BLOCKED" : "status-ACTIVE"}">
            ${isLocked ? "Đã Khóa" : "Hoạt Động"}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn-sm" onclick="viewCustomerDetails('${u._id}')" title="Xem hồ sơ & lịch sử mua hàng">
              👁 Chi tiết
            </button>
            ${u.role !== "admin" ? `
              <button class="btn-sm btn-block" onclick="handleToggleBlockCustomer('${u._id}', ${isLocked})" title="${isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}">
                ${isLocked ? "🔓 Mở" : "🔒 Khóa"}
              </button>
              <button class="btn-sm btn-del" onclick="handleDeleteCustomer('${u._id}', '${escapeStr(u.name).replace(/'/g, "\\'")}')" title="Xóa tài khoản">
                ✕
              </button>
            ` : `<span style="font-size:11px;color:var(--admin-muted);padding:5px;">Admin</span>`}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function handleCustomerFilter() {
  const q = document.getElementById("custSearchInput").value.trim().toLowerCase();
  const status = document.getElementById("custStatusFilter").value;
  const countEl = document.getElementById("custFilteredCount");

  const filtered = adminData.customers.filter((u) => {
    const matchQ = !q || (u.name && u.name.toLowerCase().includes(q)) ||
                         (u.email && u.email.toLowerCase().includes(q)) ||
                         (u.phone && u.phone.includes(q));
    const matchStatus = !status || (status === "blocked" ? u.isBlocked : !u.isBlocked);
    return matchQ && matchStatus;
  });

  if (countEl) countEl.innerText = filtered.length;

  const tbody = document.getElementById("customersTableBody");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:25px;">Không tìm thấy khách hàng nào khớp bộ lọc!</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((u) => {
    const code = "KH" + (u._id ? u._id.slice(-6).toUpperCase() : "000");
    const isLocked = u.isBlocked === true;
    return `
      <tr>
        <td><strong>#${code}</strong></td>
        <td><strong>${escapeStr(u.name)}</strong></td>
        <td>${escapeStr(u.email)}</td>
        <td>${escapeStr(u.phone || "-")}</td>
        <td>${new Date(u.createdAt).toLocaleDateString("vi-VN")}</td>
        <td><strong>${u.totalOrders || 0}</strong></td>
        <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(u.totalSpent || 0)}</td>
        <td>
          <span class="badge-status ${isLocked ? "status-BLOCKED" : "status-ACTIVE"}">
            ${isLocked ? "Đã Khóa" : "Hoạt Động"}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn-sm" onclick="viewCustomerDetails('${u._id}')">👁 Chi tiết</button>
            ${u.role !== "admin" ? `
              <button class="btn-sm btn-block" onclick="handleToggleBlockCustomer('${u._id}', ${isLocked})">
                ${isLocked ? "🔓 Mở" : "🔒 Khóa"}
              </button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// XEM CHI TIẾT KHÁCH HÀNG & LỊCH SỬ ĐƠN HÀNG
async function viewCustomerDetails(id) {
  const modal = document.getElementById("modalCustomerDetail");
  const body = document.getElementById("modalCustDetailBody");
  if (!modal || !body) return;

  body.innerHTML = `<div style="text-align:center;padding:30px;">⏳ Đang tải thông tin khách hàng...</div>`;
  modal.classList.remove("hidden");

  try {
    const res = await API.getUserById(id, adminToken);
    if (res.success && res.data) {
      const u = res.data.user;
      const orders = res.data.orders || [];
      const stats = res.data.stats || {};

      body.innerHTML = `
        <div style="background:var(--admin-bg);padding:18px;border-radius:var(--admin-radius);margin-bottom:20px;display:flex;gap:18px;align-items:center;">
          <div style="width:54px;height:54px;border-radius:50%;background:var(--admin-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;">
            ${u.name ? u.name[0].toUpperCase() : "K"}
          </div>
          <div style="flex-grow:1;">
            <h3 style="font-size:17px;margin-bottom:4px;">${escapeStr(u.name)}</h3>
            <div style="font-size:12px;color:var(--admin-muted);">
              Email: <strong>${escapeStr(u.email)}</strong> • SĐT: <strong>${escapeStr(u.phone || "Chưa có")}</strong>
            </div>
            <div style="font-size:12px;color:var(--admin-muted);margin-top:2px;">
              Địa chỉ: ${escapeStr(u.address || "Chưa cập nhật địa chỉ")}
            </div>
          </div>
          <div>
            <span class="badge-status ${u.isBlocked ? "status-BLOCKED" : "status-ACTIVE"}" style="font-size:12px;">
              ${u.isBlocked ? "Tài khoản bị khóa" : "Tài khoản hoạt động"}
            </span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:22px;">
          <div style="background:#FFF;padding:12px;border:1px solid var(--admin-border);border-radius:8px;text-align:center;">
            <div style="font-size:11px;color:var(--admin-muted);">Tổng đơn hàng</div>
            <div style="font-size:18px;font-weight:bold;">${stats.totalOrders || 0}</div>
          </div>
          <div style="background:#FFF;padding:12px;border:1px solid var(--admin-border);border-radius:8px;text-align:center;">
            <div style="font-size:11px;color:var(--admin-muted);">Tổng chi tiêu</div>
            <div style="font-size:18px;font-weight:bold;color:var(--admin-accent);">${formatMoney(stats.totalSpent || 0)}</div>
          </div>
          <div style="background:#FFF;padding:12px;border:1px solid var(--admin-border);border-radius:8px;text-align:center;">
            <div style="font-size:11px;color:var(--admin-muted);">Đơn thành công</div>
            <div style="font-size:18px;font-weight:bold;color:var(--admin-success);">${stats.completedOrders || 0}</div>
          </div>
          <div style="background:#FFF;padding:12px;border:1px solid var(--admin-border);border-radius:8px;text-align:center;">
            <div style="font-size:11px;color:var(--admin-muted);">Đơn bị hủy</div>
            <div style="font-size:18px;font-weight:bold;color:var(--admin-danger);">${stats.cancelledOrders || 0}</div>
          </div>
        </div>

        <h4 style="font-size:14px;margin-bottom:12px;">Lịch Sử Các Đơn Hàng (${orders.length} đơn)</h4>
        <div style="max-height:260px;overflow-y:auto;border:1px solid var(--admin-border);border-radius:8px;">
          ${orders.length === 0 ? `<div style="padding:20px;text-align:center;color:var(--admin-muted);">Khách hàng chưa có đơn hàng nào.</div>` : `
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày đặt</th>
                  <th>Tổng tiền</th>
                  <th>Hình thức</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map((o) => `
                  <tr>
                    <td><strong>#${o.orderCode || o._id.slice(-6).toUpperCase()}</strong></td>
                    <td>${new Date(o.createdAt).toLocaleDateString("vi-VN")}</td>
                    <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(o.totalAmount)}</td>
                    <td>${o.paymentMethod}</td>
                    <td><span class="badge-status status-${o.orderStatus}">${o.orderStatus}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </div>
      `;
    }
  } catch (e) {
    body.innerHTML = `<div style="color:var(--admin-danger);text-align:center;">Lỗi khi tải chi tiết khách hàng.</div>`;
  }
}

function closeCustomerDetailModal() {
  document.getElementById("modalCustomerDetail")?.classList.add("hidden");
}

async function handleToggleBlockCustomer(id, isCurrentlyBlocked) {
  const actionText = isCurrentlyBlocked ? "MỞ KHÓA" : "KHÓA";
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản khách hàng này không?`)) return;

  try {
    const res = await API.toggleBlockUser(id, adminToken);
    if (res.success) {
      alert(res.message);
      await loadAllAdminData();
    } else {
      alert("Lỗi: " + res.message);
    }
  } catch (e) {
    alert("Không thể thực hiện thao tác khóa tài khoản.");
  }
}

async function handleDeleteCustomer(id, name) {
  if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản khách hàng "${name}"? Thao tác này không thể hoàn tác.`)) return;

  try {
    const res = await API.deleteUser(id, adminToken);
    if (res.success) {
      alert(res.message);
      await loadAllAdminData();
    } else {
      alert("Lỗi xóa khách hàng: " + res.message);
    }
  } catch (e) {
    alert("Không thể xóa tài khoản khách hàng.");
  }
}

// ==========================================================
// 8. QUẢN LÝ SẢN PHẨM MỸ PHẨM (CRUD)
// ==========================================================
function renderProductsTable() {
  const tbody = document.getElementById("productsTableBody");
  const countEl = document.getElementById("prodFilteredCount");
  const catFilter = document.getElementById("prodCategoryFilter");
  if (!tbody) return;

  const list = adminData.products;
  if (countEl) countEl.innerText = list.length;

  // Điền dropdown lọc danh mục
  if (catFilter && catFilter.options.length <= 1) {
    adminData.categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c._id;
      opt.innerText = c.name;
      catFilter.appendChild(opt);
    });
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:25px;">Chưa có sản phẩm nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>
        <img src="${p.image || DEFAULT_IMAGE}" alt="${escapeStr(p.name)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--admin-border);" />
      </td>
      <td>
        <div style="font-weight:600;max-width:220px;" title="${escapeStr(p.name)}">${escapeStr(p.name)}</div>
        <div style="font-size:10.5px;color:var(--admin-muted);">${escapeStr(p.volume || "50ml")} • ${escapeStr(p.origin || "Pháp")}</div>
      </td>
      <td>${p.category ? escapeStr(p.category.name || p.category) : "-"}</td>
      <td>${escapeStr(p.brand || "Blushé Naturals")}</td>
      <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(p.salePrice)}</td>
      <td style="text-decoration:line-through;color:var(--admin-muted);">${formatMoney(p.originalPrice)}</td>
      <td><strong>${p.stock || 0}</strong></td>
      <td><span style="font-size:11px;background:var(--admin-sage);padding:2px 6px;border-radius:4px;">${escapeStr(p.skinType || "Mọi loại da")}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm" onclick="editProduct('${p._id}')">Sửa</button>
          <button class="btn-sm btn-del" onclick="deleteProduct('${p._id}', '${escapeStr(p.name).replace(/'/g, "\\'")}')">Xóa</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function handleProductSearch() {
  const q = document.getElementById("prodSearchInput").value.trim().toLowerCase();
  const cat = document.getElementById("prodCategoryFilter").value;

  const filtered = adminData.products.filter((p) => {
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q));
    const matchCat = !cat || (p.category && (p.category._id === cat || p.category === cat));
    return matchQ && matchCat;
  });

  document.getElementById("prodFilteredCount").innerText = filtered.length;
  const tbody = document.getElementById("productsTableBody");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:25px;">Không tìm thấy sản phẩm nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((p) => `
    <tr>
      <td><img src="${p.image || DEFAULT_IMAGE}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;" /></td>
      <td><strong>${escapeStr(p.name)}</strong></td>
      <td>${p.category ? p.category.name : "-"}</td>
      <td>${escapeStr(p.brand)}</td>
      <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(p.salePrice)}</td>
      <td style="text-decoration:line-through;color:var(--admin-muted);">${formatMoney(p.originalPrice)}</td>
      <td>${p.stock}</td>
      <td>${escapeStr(p.skinType)}</td>
      <td>
        <button class="btn-sm" onclick="editProduct('${p._id}')">Sửa</button>
        <button class="btn-sm btn-del" onclick="deleteProduct('${p._id}', '${escapeStr(p.name).replace(/'/g, "\\'")}')">Xóa</button>
      </td>
    </tr>
  `).join("");
}

function openAddProductModal() {
  document.getElementById("modalProductTitle").innerText = "Thêm Sản Phẩm Mỹ Phẩm Mới";
  document.getElementById("formProduct").reset();
  document.getElementById("prodFormId").value = "";

  // Điền dropdown danh mục & thương hiệu
  const catSelect = document.getElementById("prodFormCategory");
  catSelect.innerHTML = adminData.categories.map((c) => `<option value="${c._id}">${escapeStr(c.name)}</option>`).join("");

  const brandSelect = document.getElementById("prodFormBrand");
  brandSelect.innerHTML = adminData.brands.map((b) => `<option value="${escapeStr(b.name)}">${escapeStr(b.name)}</option>`).join("");

  document.getElementById("modalProduct")?.classList.remove("hidden");
}

function closeProductModal() {
  document.getElementById("modalProduct")?.classList.add("hidden");
}

function editProduct(id) {
  const p = adminData.products.find((prod) => prod._id === id);
  if (!p) return;

  openAddProductModal();
  document.getElementById("modalProductTitle").innerText = "Chỉnh Sửa Sản Phẩm Mỹ Phẩm";
  document.getElementById("prodFormId").value = p._id;
  document.getElementById("prodFormName").value = p.name;
  document.getElementById("prodFormCategory").value = p.category ? (p.category._id || p.category) : "";
  document.getElementById("prodFormBrand").value = p.brand;
  document.getElementById("prodFormOriginalPrice").value = p.originalPrice;
  document.getElementById("prodFormSalePrice").value = p.salePrice;
  document.getElementById("prodFormStock").value = p.stock;
  document.getElementById("prodFormVolume").value = p.volume || "50ml";
  document.getElementById("prodFormSkinType").value = p.skinType || "Mọi loại da";
  document.getElementById("prodFormOrigin").value = p.origin || "Pháp";
  document.getElementById("prodFormImage").value = p.image || "";
  document.getElementById("prodFormIngredients").value = p.ingredients || "";
  document.getElementById("prodFormUsage").value = p.usage || "";
  document.getElementById("prodFormDescription").value = p.description || "";
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("prodFormId").value;
  const prodData = {
    name: document.getElementById("prodFormName").value.trim(),
    category: document.getElementById("prodFormCategory").value,
    brand: document.getElementById("prodFormBrand").value,
    originalPrice: Number(document.getElementById("prodFormOriginalPrice").value),
    salePrice: Number(document.getElementById("prodFormSalePrice").value),
    stock: Number(document.getElementById("prodFormStock").value),
    volume: document.getElementById("prodFormVolume").value.trim(),
    skinType: document.getElementById("prodFormSkinType").value.trim(),
    origin: document.getElementById("prodFormOrigin").value.trim(),
    image: document.getElementById("prodFormImage").value.trim(),
    ingredients: document.getElementById("prodFormIngredients").value.trim(),
    usage: document.getElementById("prodFormUsage").value.trim(),
    description: document.getElementById("prodFormDescription").value.trim()
  };

  if (prodData.salePrice > prodData.originalPrice) {
    alert("Giá bán ưu đãi không được cao hơn giá niêm yết gốc!");
    return;
  }

  try {
    let res;
    if (id) {
      res = await API.updateProduct(id, prodData, adminToken);
    } else {
      res = await API.createProduct(prodData, adminToken);
    }

    if (res.success) {
      alert(id ? "Cập nhật sản phẩm thành công!" : "Thêm sản phẩm mới thành công!");
      closeProductModal();
      await loadAllAdminData();
    } else {
      alert("Lỗi: " + res.message);
    }
  } catch (error) {
    alert("Không thể lưu sản phẩm.");
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Bạn có chắc muốn xóa sản phẩm "${name}" không?`)) return;
  try {
    const res = await API.deleteProduct(id, adminToken);
    if (res.success) {
      alert("Đã xóa sản phẩm thành công!");
      await loadAllAdminData();
    } else {
      alert("Lỗi xóa: " + res.message);
    }
  } catch (e) {
    alert("Không thể xóa sản phẩm.");
  }
}

// ==========================================================
// 9. QUẢN LÝ DANH MỤC & THƯƠNG HIỆU
// ==========================================================
function renderCategoriesTable() {
  const tbody = document.getElementById("categoriesTableBody");
  if (!tbody) return;
  tbody.innerHTML = adminData.categories.map((c) => `
    <tr>
      <td><img src="${c.image || DEFAULT_IMAGE}" style="width:36px;height:36px;object-fit:cover;border-radius:50%;" /></td>
      <td><strong>${escapeStr(c.name)}</strong></td>
      <td>${escapeStr(c.slug)}</td>
      <td style="max-width:240px;font-size:12px;color:var(--admin-muted);">${escapeStr(c.description)}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString("vi-VN") : "-"}</td>
      <td>
        <button class="btn-sm btn-del" onclick="deleteCategory('${c._id}')">Xóa</button>
      </td>
    </tr>
  `).join("");
}

function openAddCategoryModal() {
  document.getElementById("formCategory").reset();
  document.getElementById("modalCategory")?.classList.remove("hidden");
}
function closeCategoryModal() {
  document.getElementById("modalCategory")?.classList.add("hidden");
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById("catFormName").value.trim();
  const image = document.getElementById("catFormImage").value.trim();
  const description = document.getElementById("catFormDescription").value.trim();

  try {
    const res = await API.createCategory({ name, image, description }, adminToken);
    if (res.success) {
      alert("Đã tạo danh mục thành công!");
      closeCategoryModal();
      await loadAllAdminData();
    } else {
      alert("Lỗi: " + res.message);
    }
  } catch (e) {
    alert("Lỗi khi tạo danh mục.");
  }
}

async function deleteCategory(id) {
  if (!confirm("Bạn có chắc muốn xóa danh mục này?")) return;
  try {
    const res = await API.deleteCategory(id, adminToken);
    if (res.success) {
      alert("Đã xóa danh mục!");
      await loadAllAdminData();
    }
  } catch (e) {
    alert("Lỗi xóa danh mục.");
  }
}

function renderBrandsTable() {
  const tbody = document.getElementById("brandsTableBody");
  if (!tbody) return;
  tbody.innerHTML = adminData.brands.map((b) => `
    <tr>
      <td><strong>${escapeStr(b.name)}</strong></td>
      <td>${escapeStr(b.origin || "Pháp")}</td>
      <td style="font-size:12px;color:var(--admin-muted);max-width:260px;">${escapeStr(b.description)}</td>
      <td><span class="badge-status status-ACTIVE">Hoạt Động</span></td>
      <td>
        <button class="btn-sm btn-del" onclick="deleteBrand('${b._id}')">Xóa</button>
      </td>
    </tr>
  `).join("");
}

function openAddBrandModal() {
  document.getElementById("formBrand").reset();
  document.getElementById("modalBrand")?.classList.remove("hidden");
}
function closeBrandModal() {
  document.getElementById("modalBrand")?.classList.add("hidden");
}

async function handleBrandSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("brandFormName").value.trim();
  const origin = document.getElementById("brandFormOrigin").value.trim();
  const description = document.getElementById("brandFormDescription").value.trim();

  try {
    const res = await API.createBrand({ name, origin, description }, adminToken);
    if (res.success) {
      alert("Đã thêm thương hiệu thành công!");
      closeBrandModal();
      await loadAllAdminData();
    } else {
      alert("Lỗi: " + res.message);
    }
  } catch (e) {
    alert("Lỗi khi thêm thương hiệu.");
  }
}

async function deleteBrand(id) {
  if (!confirm("Bạn có chắc muốn xóa thương hiệu này?")) return;
  try {
    const res = await API.deleteBrand(id, adminToken);
    if (res.success) {
      alert("Đã xóa thương hiệu!");
      await loadAllAdminData();
    }
  } catch (e) {
    alert("Lỗi xóa thương hiệu.");
  }
}

// ==========================================================
// 10. QUẢN LÝ ĐƠN HÀNG (ORDERS)
// ==========================================================
function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  const list = adminData.orders;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:25px;">Chưa có đơn hàng nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((o) => `
    <tr>
      <td><strong>#${o.orderCode || o._id.slice(-6).toUpperCase()}</strong></td>
      <td>${escapeStr(o.customerName)}</td>
      <td>${escapeStr(o.customerPhone)}</td>
      <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(o.totalAmount)}</td>
      <td><span style="font-size:11px;background:var(--admin-sage);padding:2px 7px;border-radius:10px;">${o.paymentMethod}</span></td>
      <td>
        <span class="badge-status ${o.paymentStatus === "PAID" ? "status-COMPLETED" : "status-PENDING"}">
          ${o.paymentStatus === "PAID" ? "Đã trả tiền ✓" : "Chưa trả tiền"}
        </span>
      </td>
      <td>
        <select class="form-control" style="padding:4px 8px;font-size:11px;" onchange="handleOrderStatusChange('${o._id}', this.value)">
          <option value="PENDING" ${o.orderStatus === "PENDING" ? "selected" : ""}>Chờ duyệt (PENDING)</option>
          <option value="CONFIRMED" ${o.orderStatus === "CONFIRMED" ? "selected" : ""}>Đã xác nhận (CONFIRMED)</option>
          <option value="SHIPPING" ${o.orderStatus === "SHIPPING" ? "selected" : ""}>Đang giao (SHIPPING)</option>
          <option value="COMPLETED" ${o.orderStatus === "COMPLETED" ? "selected" : ""}>Hoàn tất (COMPLETED)</option>
          <option value="CANCELLED" ${o.orderStatus === "CANCELLED" ? "selected" : ""}>Đã hủy (CANCELLED)</option>
        </select>
      </td>
      <td>
        <button class="btn-sm" onclick="viewOrderDetails('${o._id}')">👁 Xem</button>
      </td>
    </tr>
  `).join("");
}

function handleOrderFilter() {
  const q = document.getElementById("orderSearchInput").value.trim().toLowerCase();
  const status = document.getElementById("orderStatusFilter").value;
  const tbody = document.getElementById("ordersTableBody");

  const filtered = adminData.orders.filter((o) => {
    const matchQ = !q || (o.orderCode && o.orderCode.toLowerCase().includes(q)) ||
                         (o.customerName && o.customerName.toLowerCase().includes(q)) ||
                         (o.customerPhone && o.customerPhone.includes(q));
    const matchStatus = !status || o.orderStatus === status;
    return matchQ && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:25px;">Không tìm thấy đơn hàng phù hợp!</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((o) => `
    <tr>
      <td><strong>#${o.orderCode || o._id.slice(-6).toUpperCase()}</strong></td>
      <td>${escapeStr(o.customerName)}</td>
      <td>${escapeStr(o.customerPhone)}</td>
      <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(o.totalAmount)}</td>
      <td>${o.paymentMethod}</td>
      <td><span class="badge-status ${o.paymentStatus === "PAID" ? "status-COMPLETED" : "status-PENDING"}">${o.paymentStatus}</span></td>
      <td>
        <select class="form-control" style="padding:4px 8px;font-size:11px;" onchange="handleOrderStatusChange('${o._id}', this.value)">
          <option value="PENDING" ${o.orderStatus === "PENDING" ? "selected" : ""}>Chờ duyệt</option>
          <option value="CONFIRMED" ${o.orderStatus === "CONFIRMED" ? "selected" : ""}>Đã xác nhận</option>
          <option value="SHIPPING" ${o.orderStatus === "SHIPPING" ? "selected" : ""}>Đang giao</option>
          <option value="COMPLETED" ${o.orderStatus === "COMPLETED" ? "selected" : ""}>Hoàn tất</option>
          <option value="CANCELLED" ${o.orderStatus === "CANCELLED" ? "selected" : ""}>Hủy đơn</option>
        </select>
      </td>
      <td><button class="btn-sm" onclick="viewOrderDetails('${o._id}')">👁 Xem</button></td>
    </tr>
  `).join("");
}

async function handleOrderStatusChange(orderId, newStatus) {
  try {
    const paymentStatus = newStatus === "COMPLETED" ? "PAID" : undefined;
    const res = await API.updateOrderStatus(orderId, newStatus, paymentStatus, adminToken);
    if (res.success) {
      showAdminToast(`Cập nhật đơn #${res.data.orderCode} sang [${newStatus}] thành công!`);
      await loadAllAdminData();
    } else {
      alert("Lỗi cập nhật: " + res.message);
    }
  } catch (e) {
    alert("Không thể cập nhật trạng thái đơn hàng.");
  }
}

function viewOrderDetails(id) {
  const o = adminData.orders.find((ord) => ord._id === id);
  if (!o) return;

  const modal = document.getElementById("modalOrderDetail");
  const body = document.getElementById("modalOrderDetailBody");
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="background:var(--admin-bg);padding:14px;border-radius:8px;margin-bottom:16px;font-size:12.5px;">
      <div>Mã đơn: <strong style="color:var(--admin-accent);">#${o.orderCode || o._id}</strong> • Ngày: ${new Date(o.createdAt).toLocaleString("vi-VN")}</div>
      <div>Khách hàng: <strong>${escapeStr(o.customerName)}</strong> (${escapeStr(o.customerPhone)})</div>
      <div>Email: ${escapeStr(o.customerEmail)}</div>
      <div>Địa chỉ nhận: ${escapeStr(o.shippingAddress)}</div>
      <div>Thanh toán: <strong>${o.paymentMethod}</strong> (${o.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"})</div>
      <div>Ghi chú: ${escapeStr(o.note || "Không có")}</div>
    </div>

    <h4 style="font-size:13px;margin-bottom:8px;">Danh Sách Mặt Hàng:</h4>
    <div style="border:1px solid var(--admin-border);border-radius:6px;overflow:hidden;margin-bottom:16px;">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Tên sản phẩm</th>
            <th>Số lượng</th>
            <th>Đơn giá</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${(o.items || []).map((i) => `
            <tr>
              <td><strong>${escapeStr(i.name)}</strong></td>
              <td>${i.quantity}</td>
              <td>${formatMoney(i.price)}</td>
              <td style="color:var(--admin-accent);font-weight:bold;">${formatMoney(i.price * i.quantity)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:14px;font-weight:bold;border-top:1px dashed var(--admin-border);">
      <span>Tổng thanh toán:</span>
      <span style="color:var(--admin-accent);font-size:17px;">${formatMoney(o.totalAmount)}</span>
    </div>
  `;
  modal.classList.remove("hidden");
}

function closeOrderDetailModal() {
  document.getElementById("modalOrderDetail")?.classList.add("hidden");
}

// ==========================================================
// 11. MÃ GIẢM GIÁ (COUPONS) & ĐÁNH GIÁ (REVIEWS)
// ==========================================================
function renderCouponsTable() {
  const tbody = document.getElementById("couponsTableBody");
  if (!tbody) return;
  tbody.innerHTML = adminData.coupons.map((cp) => `
    <tr>
      <td><strong style="color:var(--admin-accent);letter-spacing:1px;">${escapeStr(cp.code)}</strong></td>
      <td>${escapeStr(cp.description)}</td>
      <td>${cp.discountType === "PERCENT" ? "Phần trăm (%)" : "Cố định (VNĐ)"}</td>
      <td style="font-weight:bold;">${cp.discountType === "PERCENT" ? cp.discountValue + "%" : formatMoney(cp.discountValue)}</td>
      <td>${formatMoney(cp.minOrderValue || 0)}</td>
      <td>${new Date(cp.expiryDate).toLocaleDateString("vi-VN")}</td>
      <td><span class="badge-status status-ACTIVE">Hoạt Động</span></td>
      <td>
        <button class="btn-sm btn-del" onclick="deleteCoupon('${cp._id}')">Xóa</button>
      </td>
    </tr>
  `).join("");
}

function openAddCouponModal() {
  document.getElementById("formCoupon").reset();
  document.getElementById("modalCoupon")?.classList.remove("hidden");
}
function closeCouponModal() {
  document.getElementById("modalCoupon")?.classList.add("hidden");
}

async function handleCouponSubmit(e) {
  e.preventDefault();
  const couponData = {
    code: document.getElementById("couponFormCode").value.trim(),
    description: document.getElementById("couponFormDesc").value.trim(),
    discountType: document.getElementById("couponFormType").value,
    discountValue: Number(document.getElementById("couponFormVal").value),
    minOrderValue: Number(document.getElementById("couponFormMin").value),
    expiryDate: document.getElementById("couponFormExpiry").value
  };

  try {
    const res = await API.createCoupon(couponData, adminToken);
    if (res.success) {
      alert("Đã tạo mã voucher thành công!");
      closeCouponModal();
      await loadAllAdminData();
    } else {
      alert("Lỗi: " + res.message);
    }
  } catch (e) {
    alert("Không thể tạo mã voucher.");
  }
}

async function deleteCoupon(id) {
  if (!confirm("Bạn có chắc muốn xóa mã giảm giá này?")) return;
  try {
    const res = await API.deleteCoupon(id, adminToken);
    if (res.success) {
      alert("Đã xóa mã giảm giá!");
      await loadAllAdminData();
    }
  } catch (e) {
    alert("Lỗi xóa mã.");
  }
}

function renderReviewsTable() {
  const tbody = document.getElementById("reviewsTableBody");
  if (!tbody) return;
  tbody.innerHTML = adminData.reviews.map((r) => `
    <tr>
      <td><strong>${escapeStr(r.customerName)}</strong><br/><span style="font-size:11px;color:var(--admin-muted);">${escapeStr(r.customerEmail)}</span></td>
      <td>${r.product ? escapeStr(r.product.name) : "Mỹ phẩm"}</td>
      <td style="color:#D9822B;font-weight:bold;">${"★".repeat(r.rating || 5)}</td>
      <td style="font-size:12px;max-width:280px;">"${escapeStr(r.comment)}"</td>
      <td>${new Date(r.createdAt).toLocaleDateString("vi-VN")}</td>
      <td>
        <span class="badge-status ${r.isApproved ? "status-COMPLETED" : "status-CANCELLED"}">
          ${r.isApproved ? "Đang hiện" : "Đã ẩn"}
        </span>
      </td>
      <td>
        <button class="btn-sm" onclick="toggleReviewApprove('${r._id}')">${r.isApproved ? "Ẩn" : "Hiện"}</button>
        <button class="btn-sm btn-del" onclick="deleteReview('${r._id}')">Xóa</button>
      </td>
    </tr>
  `).join("");
}

async function toggleReviewApprove(id) {
  try {
    const res = await API.toggleApproveReview(id, adminToken);
    if (res.success) await loadAllAdminData();
  } catch (e) {
    alert("Lỗi ẩn/hiện đánh giá.");
  }
}

async function deleteReview(id) {
  if (!confirm("Bạn có chắc muốn xóa đánh giá này?")) return;
  try {
    const res = await API.deleteReview(id, adminToken);
    if (res.success) await loadAllAdminData();
  } catch (e) {
    alert("Lỗi xóa đánh giá.");
  }
}

// ==========================================================
// 12. KHO HÀNG & BÁO CÁO DOANH THU (INVENTORY & REPORTS)
// ==========================================================
function renderInventoryTable() {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = adminData.products.map((p) => {
    let statusText = "Đầy đủ";
    let statusClass = "status-COMPLETED";
    if (p.stock <= 0) {
      statusText = "Hết hàng";
      statusClass = "status-CANCELLED";
    } else if (p.stock <= 10) {
      statusText = "Sắp hết hàng";
      statusClass = "status-PENDING";
    }

    return `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeStr(p.name)}</div>
          <div style="font-size:11px;color:var(--admin-muted);">${escapeStr(p.brand)}</div>
        </td>
        <td>${p.category ? escapeStr(p.category.name) : "-"}</td>
        <td><strong style="font-size:15px;">${p.stock}</strong> món</td>
        <td><span class="badge-status ${statusClass}">${statusText}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="number" id="quickStock_${p._id}" value="${p.stock}" style="width:65px;padding:4px 8px;border:1px solid var(--admin-border);border-radius:4px;" />
            <button class="btn-sm" onclick="handleQuickStockUpdate('${p._id}')">Lưu</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function handleQuickStockUpdate(id) {
  const input = document.getElementById(`quickStock_${id}`);
  if (!input) return;
  const newStock = Number(input.value);
  if (newStock < 0) {
    alert("Số lượng kho không được âm!");
    return;
  }

  try {
    const res = await API.updateProduct(id, { stock: newStock }, adminToken);
    if (res.success) {
      showAdminToast("Đã cập nhật tồn kho thành công!");
      await loadAllAdminData();
    }
  } catch (e) {
    alert("Lỗi cập nhật tồn kho.");
  }
}

function renderReports() {
  const statEl = document.getElementById("paymentMethodStats");
  if (!statEl) return;

  const validOrders = adminData.orders.filter((o) => o.orderStatus !== "CANCELLED");
  const vietqrTotal = validOrders.filter((o) => o.paymentMethod === "VIETQR").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const momoTotal = validOrders.filter((o) => o.paymentMethod === "MOMO_QR").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const codTotal = validOrders.filter((o) => o.paymentMethod === "COD").reduce((s, o) => s + (o.totalAmount || 0), 0);

  statEl.innerHTML = `
    <div style="background:var(--admin-bg);padding:18px;border-radius:8px;text-align:center;">
      <div style="font-size:12px;color:var(--admin-muted);margin-bottom:4px;">Chuyển Khoản VietQR (MB)</div>
      <div style="font-size:20px;font-weight:bold;color:var(--admin-accent);">${formatMoney(vietqrTotal)}</div>
      <div style="font-size:11px;color:var(--admin-muted);margin-top:4px;">${validOrders.filter((o) => o.paymentMethod === "VIETQR").length} đơn hàng</div>
    </div>
    <div style="background:var(--admin-bg);padding:18px;border-radius:8px;text-align:center;">
      <div style="font-size:12px;color:var(--admin-muted);margin-bottom:4px;">Ví Điện Tử MoMo (QR)</div>
      <div style="font-size:20px;font-weight:bold;color:#C26B6B;">${formatMoney(momoTotal)}</div>
      <div style="font-size:11px;color:var(--admin-muted);margin-top:4px;">${validOrders.filter((o) => o.paymentMethod === "MOMO_QR").length} đơn hàng</div>
    </div>
    <div style="background:var(--admin-bg);padding:18px;border-radius:8px;text-align:center;">
      <div style="font-size:12px;color:var(--admin-muted);margin-bottom:4px;">Tiền Mặt Khi Nhận (COD)</div>
      <div style="font-size:20px;font-weight:bold;color:#D9822B;">${formatMoney(codTotal)}</div>
      <div style="font-size:11px;color:var(--admin-muted);margin-top:4px;">${validOrders.filter((o) => o.paymentMethod === "COD").length} đơn hàng</div>
    </div>
  `;

  // Render danh sách tài khoản
  const accTable = document.getElementById("accountsTableBody");
  if (accTable) {
    accTable.innerHTML = adminData.customers.map((u) => `
      <tr>
        <td><strong>${escapeStr(u.name)}</strong></td>
        <td>${escapeStr(u.email)}</td>
        <td>${escapeStr(u.phone || "-")}</td>
        <td><strong style="color:${u.role === "admin" ? "var(--admin-accent)" : "inherit"};">${u.role === "admin" ? "🛡️ Quản trị viên (Admin)" : "👤 Khách hàng (Customer)"}</strong></td>
        <td>${new Date(u.createdAt).toLocaleDateString("vi-VN")}</td>
        <td><span class="badge-status ${u.isBlocked ? "status-BLOCKED" : "status-ACTIVE"}">${u.isBlocked ? "Bị khóa" : "Hoạt động"}</span></td>
      </tr>
    `).join("");
  }
}

function handleGlobalSearch(q) {
  if (!q) return;
  q = q.toLowerCase();
  // Nếu gõ tìm đơn, chuyển qua tab đơn
  if (q.startsWith("dh") || q.startsWith("#dh")) {
    switchAdminTab("tabOrders", document.querySelector('[onclick*="tabOrders"]'));
    const inp = document.getElementById("orderSearchInput");
    if (inp) { inp.value = q; handleOrderFilter(); }
  }
}

function showAdminToast(msg) {
  const toast = document.createElement("div");
  toast.innerText = msg;
  toast.style.position = "fixed";
  toast.style.top = "20px";
  toast.style.right = "20px";
  toast.style.background = "#303A30";
  toast.style.color = "#FFFFFF";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "8px";
  toast.style.fontSize = "13px";
  toast.style.zIndex = "999";
  toast.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
