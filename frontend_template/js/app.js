/* ==========================================================
   BLUSHÉ BEAUTY - LUXURY ORGANIC BEAUTY E-COMMERCE
   FRONTEND JAVASCRIPT LOGIC
   ========================================================== */

// 1. APPLICATION STATE
let currentCategory = "";
let currentBrand = "";
let currentSkinType = "";
let currentSearch = "";
let currentSort = "newest";

let cart = JSON.parse(localStorage.getItem("BLUSHE_CART") || "[]");
let currentUser = JSON.parse(localStorage.getItem("BLUSHE_USER") || "null");
let authToken = localStorage.getItem("BLUSHE_TOKEN") || "";

let appliedCoupon = null;
let currentShippingFee = 20000;
let lastCreatedOrder = null;

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600";

// 2. INITIALIZE ON DOM READY
document.addEventListener("DOMContentLoaded", () => {
  initCountdown();
  initCategories();
  loadProducts();
  updateCartUI();
  updateAuthUI();
  setupSearchListener();
});

// 3. COUNTDOWN TIMER CHO FLASH SALE
function initCountdown() {
  const hEl = document.getElementById("cdHours");
  const mEl = document.getElementById("cdMinutes");
  const sEl = document.getElementById("cdSeconds");
  if (!hEl || !mEl || !sEl) return;

  let totalSeconds = 8 * 3600 + 45 * 60 + 30;
  setInterval(() => {
    if (totalSeconds > 0) {
      totalSeconds--;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      hEl.innerText = String(hours).padStart(2, "0");
      mEl.innerText = String(minutes).padStart(2, "0");
      sEl.innerText = String(seconds).padStart(2, "0");
    }
  }, 1000);
}

// 4. FORMAT TIỀN TỆ & TIỆN ÍCH
function formatPrice(num) {
  return `${Number(num || 0).toLocaleString("vi-VN")} đ`;
}

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 5. TẢI VÀ HIỂN THỊ DANH MỤC (VISUAL CARDS & PILLS)
async function initCategories() {
  const cardsContainer = document.getElementById("categoryCards");
  const pillsContainer = document.getElementById("categoryPills");

  try {
    const res = await API.getCategories();
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      // 1. Render Visual Cards (tối đa 6 card nổi bật)
      if (cardsContainer) {
        cardsContainer.innerHTML = res.data.slice(0, 6).map((c) => `
          <div class="category-card" onclick="filterByCategory('${c._id}')">
            <img src="${c.image || DEFAULT_IMAGE}" alt="${escapeHTML(c.name)}" class="category-card-img" />
            <div class="category-card-name">${escapeHTML(c.name)}</div>
          </div>
        `).join("");
      }

      // 2. Render Pills (11 danh mục)
      if (pillsContainer) {
        let pillsHtml = `<button class="cat-pill active" data-id="" onclick="filterByCategory('')">Tất cả sản phẩm</button>`;
        res.data.forEach((c) => {
          pillsHtml += `<button class="cat-pill" data-id="${c._id}" onclick="filterByCategory('${c._id}')">${escapeHTML(c.name)}</button>`;
        });
        pillsContainer.innerHTML = pillsHtml;
      }
    }
  } catch (error) {
    console.error("Lỗi tải danh mục:", error);
  }
}

function filterByCategory(catId) {
  currentCategory = catId;
  const pills = document.querySelectorAll(".cat-pill");
  pills.forEach((p) => {
    if (p.dataset.id === catId) {
      p.classList.add("active");
    } else {
      p.classList.remove("active");
    }
  });
  loadProducts();
}

function handleBrandChange(brand) {
  currentBrand = brand;
  loadProducts();
}

function handleSkinTypeChange(skin) {
  currentSkinType = skin;
  loadProducts();
}

function handleSortChange(sort) {
  currentSort = sort;
  loadProducts();
}

function setupSearchListener() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  let timer = null;
  input.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      currentSearch = e.target.value.trim();
      loadProducts();
    }, 350);
  });
}

// 6. TẢI VÀ HIỂN THỊ SẢN PHẨM (3 CỘT MÁY TÍNH, 2 TABLET, 1 ĐIỆN THOẠI)
async function loadProducts() {
  const grid = document.getElementById("productGrid");
  const countEl = document.getElementById("productCount");
  if (!grid) return;

  grid.innerHTML = `
    <div style="grid-column: 1/-1; text-align:center; padding: 40px;">
      <div style="font-size:24px;margin-bottom:10px;">🌿</div>
      <p style="color:var(--text-muted);">Đang tải sản phẩm mỹ phẩm Blushé Beauty...</p>
    </div>
  `;

  try {
    const res = await API.getProducts({
      category: currentCategory,
      brand: currentBrand,
      skinType: currentSkinType,
      search: currentSearch,
      sort: currentSort
    });

    if (res.success && Array.isArray(res.data)) {
      if (countEl) countEl.innerText = res.data.length;

      if (res.data.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; background:#FFFFFF; border-radius:var(--radius-md); border:1px solid var(--border-light);">
            <div style="font-size:36px;margin-bottom:12px;">🍃</div>
            <h3 style="font-size:18px;margin-bottom:8px;">Không tìm thấy sản phẩm phù hợp</h3>
            <p style="color:var(--text-muted);font-size:13px;">Bạn vui lòng thử chọn danh mục khác hoặc nhập từ khóa tìm kiếm khác nhé.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = res.data.map((p) => {
        const discount = p.originalPrice > p.salePrice ? Math.round(((p.originalPrice - p.salePrice) / p.originalPrice) * 100) : 0;
        return `
          <div class="product-card">
            <div class="product-thumb-wrap">
              <div class="badge-tag-wrap">
                ${discount > 0 ? `<span class="badge-tag tag-sale">-${discount}%</span>` : ""}
                ${p.isNewArrival ? `<span class="badge-tag tag-new">Mới</span>` : ""}
                <span class="badge-tag tag-organic">Hữu cơ</span>
              </div>
              <img
                src="${p.image || DEFAULT_IMAGE}"
                alt="${escapeHTML(p.name)}"
                class="product-thumb"
                loading="lazy"
                onerror="this.src='${DEFAULT_IMAGE}'"
              />
              <button class="btn-quick-view" onclick="openProductDetailModal('${p._id}')">
                👁 Xem Chi Tiết
              </button>
            </div>

            <div class="product-info">
              <div class="product-brand">${escapeHTML(p.brand || "Blushé Naturals")}</div>
              <h3 class="product-name" onclick="openProductDetailModal('${p._id}')" style="cursor:pointer;" title="${escapeHTML(p.name)}">
                ${escapeHTML(p.name)}
              </h3>

              <div class="product-rating">
                <span>★</span>
                <span style="font-weight:700;color:var(--text-main);">${p.rating || 5.0}</span>
                <span class="rating-count">(${p.stock > 0 ? "Còn " + p.stock : "Hết hàng"})</span>
              </div>

              <div class="product-meta-specs">
                <span class="meta-pill">🧴 ${escapeHTML(p.volume || "50ml")}</span>
                <span class="meta-pill">🌱 ${escapeHTML(p.skinType || "Mọi loại da")}</span>
              </div>

              <div class="product-pricing">
                <div>
                  <span class="price-current">${formatPrice(p.salePrice)}</span>
                  ${discount > 0 ? `<span class="price-original">${formatPrice(p.originalPrice)}</span>` : ""}
                </div>
                <button
                  class="btn-add-cart"
                  onclick="addToCart('${p._id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}', ${p.salePrice}, '${p.image || DEFAULT_IMAGE}')"
                  title="Thêm vào giỏ hàng"
                  ${p.stock <= 0 ? "disabled style='opacity:0.4;'" : ""}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  } catch (error) {
    console.error("Lỗi nạp sản phẩm:", error);
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#C26B6B;">Không thể tải sản phẩm. Vui lòng kiểm tra kết nối API!</div>`;
  }
}

// 7. CHI TIẾT SẢN PHẨM MODAL (ĐẦY ĐỦ THÀNH PHẦN, CÔNG DỤNG, HƯỚNG DẪN DÙNG)
async function openProductDetailModal(id) {
  const modal = document.getElementById("productDetailModal");
  const content = document.getElementById("productDetailContent");
  const brandEl = document.getElementById("modalBrand");
  if (!modal || !content) return;

  content.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Đang tải thông tin chi tiết sản phẩm...</div>`;
  modal.classList.remove("hidden");

  try {
    const res = await API.getProductById(id);
    if (res.success && res.data) {
      const p = res.data;
      if (brandEl) brandEl.innerText = p.brand || "BLUSHÉ NATURALS";
      const discount = p.originalPrice > p.salePrice ? Math.round(((p.originalPrice - p.salePrice) / p.originalPrice) * 100) : 0;

      content.innerHTML = `
        <div class="detail-grid">
          <div class="detail-img-wrap">
            <img src="${p.image || DEFAULT_IMAGE}" alt="${escapeHTML(p.name)}" class="detail-img" />
          </div>

          <div>
            <h2 class="detail-title">${escapeHTML(p.name)}</h2>

            <div class="product-rating" style="margin-bottom:14px;">
              <span>★★★★★</span>
              <span style="font-weight:700;color:var(--text-main);">${p.rating || 5.0}/5.0</span>
              <span class="rating-count">• Xuất xứ: <strong>${escapeHTML(p.origin || "Pháp")}</strong></span>
            </div>

            <div class="detail-price-wrap">
              <span class="detail-price">${formatPrice(p.salePrice)}</span>
              ${discount > 0 ? `<span class="detail-original-price">${formatPrice(p.originalPrice)}</span>` : ""}
              ${discount > 0 ? `<span class="badge-tag tag-sale">Tiết kiệm ${discount}%</span>` : ""}
            </div>

            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.8;">
              ${escapeHTML(p.description || "Sản phẩm mỹ phẩm hữu cơ cao cấp được chiết xuất từ thiên nhiên an toàn và lành tính.")}
            </p>

            <!-- Specs Table -->
            <div style="background:var(--bg-body);padding:14px;border-radius:var(--radius-sm);margin-bottom:18px;font-size:12.5px;">
              <div class="detail-spec-row">
                <span class="detail-spec-label">Loại da phù hợp:</span>
                <span>${escapeHTML(p.skinType || "Mọi loại da")}</span>
              </div>
              <div class="detail-spec-row">
                <span class="detail-spec-label">Dung tích / Khối lượng:</span>
                <span>${escapeHTML(p.volume || "50ml")}</span>
              </div>
              <div class="detail-spec-row">
                <span class="detail-spec-label">Tồn kho khả dụng:</span>
                <span style="color:var(--color-accent);font-weight:600;">${p.stock > 0 ? p.stock + " sản phẩm" : "Tạm hết hàng"}</span>
              </div>
            </div>

            <!-- Tab nội dung chi tiết -->
            <div class="detail-tabs-nav">
              <button class="detail-tab-btn active" onclick="switchDetailTab(this, 'tabIng')">Thành Phần</button>
              <button class="detail-tab-btn" onclick="switchDetailTab(this, 'tabUse')">Hướng Dẫn Dùng</button>
            </div>
            <div id="tabIng" style="font-size:12.5px;color:var(--color-grey-green);line-height:1.8;margin-bottom:20px;">
              ${escapeHTML(p.ingredients || "Chiết xuất thảo mộc hữu cơ, Niacinamide, Hyaluronic Acid, Vitamin E.")}
            </div>
            <div id="tabUse" style="font-size:12.5px;color:var(--color-grey-green);line-height:1.8;margin-bottom:20px;display:none;">
              ${escapeHTML(p.usage || "Làm sạch da, lấy lượng vừa đủ thoa đều và vỗ nhẹ mỗi ngày vào buổi sáng và tối.")}
            </div>

            <div style="display:flex;gap:12px;">
              <button class="btn-primary" style="flex:1;" onclick="addToCart('${p._id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}', ${p.salePrice}, '${p.image || DEFAULT_IMAGE}'); closeProductDetailModal();">
                🛒 Thêm Vào Giỏ Hàng
              </button>
              <button class="btn-secondary" onclick="buyNow('${p._id}', '${escapeHTML(p.name).replace(/'/g, "\\'")}', ${p.salePrice}, '${p.image || DEFAULT_IMAGE}')">
                Mua Ngay
              </button>
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    content.innerHTML = `<div style="color:#C26B6B;text-align:center;">Lỗi khi tải thông tin sản phẩm.</div>`;
  }
}

function switchDetailTab(btn, tabId) {
  document.querySelectorAll(".detail-tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tabIng").style.display = tabId === "tabIng" ? "block" : "none";
  document.getElementById("tabUse").style.display = tabId === "tabUse" ? "block" : "none";
}

function closeProductDetailModal() {
  document.getElementById("productDetailModal")?.classList.add("hidden");
}

// 8. QUẢN LÝ GIỎ HÀNG (CART LOGIC)
function saveCart() {
  localStorage.setItem("BLUSHE_CART", JSON.stringify(cart));
  updateCartUI();
}

function addToCart(id, name, price, image) {
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, name, price, image, quantity: 1 });
  }
  saveCart();
  showToast(`Đã thêm "${name}" vào giỏ hàng!`);
}

function buyNow(id, name, price, image) {
  addToCart(id, name, price, image);
  closeProductDetailModal();
  toggleCartDrawer(true);
}

function updateCartQty(id, delta) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter((i) => i.id !== id);
  }
  saveCart();
}

function removeCartItem(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
}

function toggleCartDrawer(forceOpen = false) {
  const backdrop = document.getElementById("cartBackdrop");
  const drawer = document.getElementById("cartDrawer");
  if (!drawer || !backdrop) return;

  if (forceOpen || !drawer.classList.contains("open")) {
    drawer.classList.add("open");
    backdrop.classList.add("open");
  } else {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  }
}

function updateCartUI() {
  const badge = document.getElementById("cartBadge");
  const body = document.getElementById("cartItemsBody");
  const subtotalEl = document.getElementById("cartSubtotal");
  const shipEl = document.getElementById("cartShippingFee");
  const totalEl = document.getElementById("cartTotal");
  const discountLine = document.getElementById("discountLine");
  const discountAmountEl = document.getElementById("cartDiscountAmount");

  const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);
  if (badge) badge.innerText = totalQty;

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Miễn phí ship cho đơn từ 500.000đ
  let shipping = 25000;
  if (subtotal >= 500000 || subtotal === 0) {
    shipping = 0;
  }
  currentShippingFee = shipping;

  // Tính giảm giá nếu có coupon
  let discount = 0;
  if (appliedCoupon && subtotal > 0) {
    if (appliedCoupon.discountType === "PERCENT") {
      discount = Math.round((subtotal * appliedCoupon.discountValue) / 100);
      if (appliedCoupon.maxDiscountAmount && discount > appliedCoupon.maxDiscountAmount) {
        discount = appliedCoupon.maxDiscountAmount;
      }
    } else {
      discount = appliedCoupon.discountValue;
    }
  }

  const finalTotal = Math.max(0, subtotal - discount + shipping);

  if (subtotalEl) subtotalEl.innerText = formatPrice(subtotal);
  if (shipEl) shipEl.innerText = shipping === 0 ? "Miễn phí" : formatPrice(shipping);
  if (totalEl) totalEl.innerText = formatPrice(finalTotal);

  if (discountLine && discountAmountEl) {
    if (discount > 0) {
      discountLine.style.display = "flex";
      discountAmountEl.innerText = `-${formatPrice(discount)}`;
    } else {
      discountLine.style.display = "none";
    }
  }

  if (body) {
    if (cart.length === 0) {
      body.innerHTML = `
        <div style="text-align:center;padding:50px 20px;">
          <div style="font-size:36px;margin-bottom:12px;">🌿</div>
          <h4 style="font-size:15px;margin-bottom:6px;">Giỏ hàng của bạn đang trống</h4>
          <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:18px;">Hãy dạo một vòng và chọn những sản phẩm ưng ý nhé.</p>
          <button class="btn-secondary" onclick="toggleCartDrawer()">Tiếp Tục Mua Sắm</button>
        </div>
      `;
    } else {
      body.innerHTML = cart.map((item) => `
        <div class="cart-item">
          <img src="${item.image || DEFAULT_IMAGE}" alt="${escapeHTML(item.name)}" class="cart-item-img" />
          <div class="cart-item-info">
            <div class="cart-item-title">${escapeHTML(item.name)}</div>
            <div class="cart-item-price">${formatPrice(item.price)}</div>
            <div class="cart-item-actions">
              <div class="qty-control">
                <button type="button" class="qty-btn" onclick="updateCartQty('${item.id}', -1)">-</button>
                <span class="qty-num">${item.quantity}</span>
                <button type="button" class="qty-btn" onclick="updateCartQty('${item.id}', 1)">+</button>
              </div>
              <button type="button" class="btn-item-del" onclick="removeCartItem('${item.id}')">Xóa</button>
            </div>
          </div>
        </div>
      `).join("");
    }
  }
}

// 9. ÁP DỤNG MÃ GIẢM GIÁ (COUPON)
async function handleApplyCoupon() {
  const input = document.getElementById("couponCodeInput");
  const notice = document.getElementById("appliedCouponNotice");
  if (!input) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    alert("Vui lòng nhập mã giảm giá (ví dụ: BLUSHE10, NANGNIU50, FREESHIP)!");
    return;
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (subtotal === 0) {
    alert("Giỏ hàng của bạn đang trống!");
    return;
  }

  try {
    const res = await API.applyCoupon(code, subtotal);
    if (res.success && res.data) {
      appliedCoupon = res.data;
      if (notice) {
        notice.style.display = "block";
        notice.innerText = `✓ Đã áp dụng mã [${res.data.code}] giảm ${formatPrice(res.data.discountAmount)}`;
      }
      updateCartUI();
    } else {
      alert(res.message || "Mã giảm giá không hợp lệ!");
    }
  } catch (error) {
    alert("Lỗi khi áp dụng mã giảm giá.");
  }
}

// 10. CHECKOUT MODAL & ĐẶT HÀNG
function openCheckoutModal() {
  if (cart.length === 0) {
    alert("Giỏ hàng đang trống! Vui lòng chọn sản phẩm trước khi thanh toán.");
    return;
  }
  toggleCartDrawer(false);

  // Tự điền thông tin nếu user đã đăng nhập
  if (currentUser) {
    const nameInp = document.getElementById("orderCustomerName");
    const phoneInp = document.getElementById("orderCustomerPhone");
    const emailInp = document.getElementById("orderCustomerEmail");
    const addrInp = document.getElementById("orderShippingAddress");
    if (nameInp && currentUser.name) nameInp.value = currentUser.name;
    if (phoneInp && currentUser.phone) phoneInp.value = currentUser.phone;
    if (emailInp && currentUser.email) emailInp.value = currentUser.email;
    if (addrInp && currentUser.address) addrInp.value = currentUser.address;
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  let discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const finalTotal = Math.max(0, subtotal - discount + currentShippingFee);
  const totalEl = document.getElementById("checkoutFinalTotal");
  if (totalEl) totalEl.innerText = formatPrice(finalTotal);

  document.getElementById("checkoutModal")?.classList.remove("hidden");
}

function closeCheckoutModal() {
  document.getElementById("checkoutModal")?.classList.add("hidden");
}

function handleProvinceChange(province) {
  let fee = 20000;
  if (province.includes("Hà Nội")) fee = 35000;
  else if (province.includes("Đà Nẵng") || province.includes("Khác")) fee = 30000;

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (subtotal >= 500000) fee = 0;

  currentShippingFee = fee;
  const dispEl = document.getElementById("displayShippingFee");
  if (dispEl) dispEl.value = fee === 0 ? "Miễn phí (Đơn >= 500k)" : formatPrice(fee);

  let discount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const finalTotal = Math.max(0, subtotal - discount + currentShippingFee);
  const totalEl = document.getElementById("checkoutFinalTotal");
  if (totalEl) totalEl.innerText = formatPrice(finalTotal);
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById("btnSubmitOrder");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Đang tạo đơn hàng...";
  }

  try {
    const customerName = form.customerName.value.trim();
    const customerPhone = form.customerPhone.value.trim();
    const customerEmail = form.customerEmail.value.trim();
    const shippingAddress = form.shippingAddress.value.trim();
    const paymentMethod = form.paymentMethod.value;
    const note = form.note ? form.note.value.trim() : "";

    const orderData = {
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      paymentMethod,
      shippingFee: currentShippingFee,
      note,
      items: cart.map((i) => ({
        productId: i.id,
        name: i.name,
        quantity: i.quantity,
        price: i.price
      }))
    };

    const res = await API.createOrder(orderData);
    if (res.success && res.data) {
      lastCreatedOrder = res.data;
      cart = [];
      appliedCoupon = null;
      saveCart();
      closeCheckoutModal();

      if (paymentMethod === "VIETQR" || paymentMethod === "MOMO_QR") {
        showQRModal(lastCreatedOrder, paymentMethod);
      } else {
        alert(`🎉 ĐẶT HÀNG THÀNH CÔNG!\n\nMã đơn hàng: #${lastCreatedOrder.orderCode}\nTổng thanh toán: ${formatPrice(lastCreatedOrder.totalAmount)}\n\nCảm ơn bạn đã lựa chọn mỹ phẩm Blushé Beauty!`);
      }
    } else {
      alert(`Đặt hàng không thành công: ${res.message || "Vui lòng thử lại"}`);
    }
  } catch (error) {
    console.error("Lỗi đặt hàng:", error);
    alert("Không thể gửi đơn hàng. Vui lòng kiểm tra lại kết nối API!");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Xác Nhận Đặt Mua";
    }
  }
}

// 11. MODAL THANH TOÁN QR - BẢO TOÀN NGUYÊN VẸN MÃ QR VÀ NGÂN HÀNG MB
function showQRModal(order, method) {
  const modal = document.getElementById("qrModal");
  const qrImg = document.getElementById("qrImage");
  const codeEl = document.getElementById("qrOrderCode");
  const totalEl = document.getElementById("qrTotalAmount");
  const noteEl = document.getElementById("qrNoteInfo");

  const totalAmount = Number(order.totalAmount || 0);
  const orderCode = order.orderCode || (order._id ? order._id.slice(-6).toUpperCase() : "ORDER");

  if (codeEl) codeEl.innerText = `#${orderCode}`;
  if (totalEl) totalEl.innerText = formatPrice(totalAmount);
  if (noteEl) noteEl.innerText = `DH ${orderCode}`;

  if (qrImg) {
    if (method === "VIETQR") {
      // GIỮ NGUYÊN CHUẨN VIETQR NGÂN HÀNG QUÂN ĐỘI MB (0365187193 - LIU THOI PHU)
      qrImg.src = `https://img.vietqr.io/image/MB-0365187193-compact2.png?amount=${totalAmount}&addInfo=DH%20${encodeURIComponent(orderCode)}&accountName=LIU%20TH%E1%BB%9CI%20PH%C3%9A`;
    } else {
      // GIỮ NGUYÊN CHUẨN MOMO QR (0365187193)
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`2|99|0365187193|BLUSHE BEAUTY||0|0|${totalAmount}|DH ${orderCode}|transfer_myqr`)}`;
    }
  }

  if (modal) modal.classList.remove("hidden");
}

function closeQRModal() {
  document.getElementById("qrModal")?.classList.add("hidden");
}

async function handleConfirmPaymentClick() {
  if (!lastCreatedOrder) {
    closeQRModal();
    return;
  }
  try {
    const res = await API.confirmPayment(lastCreatedOrder._id);
    if (res.success) {
      alert("✓ Xác nhận thanh toán thành công! Blushé Beauty sẽ chuẩn bị và giao hàng cho bạn sớm nhất.");
      closeQRModal();
    } else {
      alert("Đã lưu thông báo thanh toán. Cảm ơn bạn!");
      closeQRModal();
    }
  } catch (e) {
    closeQRModal();
  }
}

// 12. XÁC THỰC VÀ TÀI KHOẢN KHÁCH HÀNG
function updateAuthUI() {
  const btn = document.getElementById("btnUserAccount");
  if (!btn) return;
  if (currentUser) {
    btn.innerHTML = "👤";
    btn.title = `Xin chào, ${currentUser.name} (Bấm để xem hồ sơ)`;
    btn.style.color = "var(--color-accent)";
  } else {
    btn.innerHTML = "👤";
    btn.title = "Đăng nhập / Đăng ký tài khoản";
    btn.style.color = "var(--text-main)";
  }
}

function handleUserAccountClick() {
  if (currentUser) {
    openUserAccountModal();
  } else {
    openAuthModal();
  }
}

function openAuthModal() {
  document.getElementById("authModal")?.classList.remove("hidden");
}

function closeAuthModal() {
  document.getElementById("authModal")?.classList.add("hidden");
}

function switchAuthTab(tab) {
  const btnLogin = document.getElementById("tabAuthLogin");
  const btnReg = document.getElementById("tabAuthRegister");
  const fLogin = document.getElementById("loginForm");
  const fReg = document.getElementById("registerForm");
  const title = document.getElementById("authModalTitle");

  if (tab === "login") {
    btnLogin.classList.add("active");
    btnReg.classList.remove("active");
    fLogin.style.display = "block";
    fReg.style.display = "none";
    if (title) title.innerText = "Đăng Nhập Tài Khoản";
  } else {
    btnReg.classList.add("active");
    btnLogin.classList.remove("active");
    fLogin.style.display = "none";
    fReg.style.display = "block";
    if (title) title.innerText = "Đăng Ký Thành Viên Mới";
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;

  try {
    const res = await API.login(email, password);
    if (res.success && res.token) {
      authToken = res.token;
      currentUser = res.user;
      localStorage.setItem("BLUSHE_TOKEN", authToken);
      localStorage.setItem("BLUSHE_USER", JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      showToast(`Đăng nhập thành công! Chào mừng ${currentUser.name} trở lại.`);

      if (currentUser.role === "admin") {
        if (confirm("Bạn đang đăng nhập với quyền Quản trị viên (Admin). Bạn có muốn mở Trang Quản Trị không?")) {
          window.location.href = "admin.html";
        }
      }
    } else {
      alert(res.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.");
    }
  } catch (error) {
    alert("Không thể kết nối máy chủ đăng nhập.");
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const userData = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value
  };

  try {
    const res = await API.register(userData);
    if (res.success && res.token) {
      authToken = res.token;
      currentUser = res.user;
      localStorage.setItem("BLUSHE_TOKEN", authToken);
      localStorage.setItem("BLUSHE_USER", JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      alert("Chúc mừng bạn đã đăng ký tài khoản thành công! Tặng bạn mã voucher [BLUSHE10] giảm 10% cho đơn hàng đầu tiên.");
    } else {
      alert(res.message || "Đăng ký thất bại.");
    }
  } catch (error) {
    alert("Không thể kết nối máy chủ đăng ký.");
  }
}

// 13. HỒ SƠ KHÁCH HÀNG & LỊCH SỬ MUA HÀNG
async function openUserAccountModal() {
  const modal = document.getElementById("userAccountModal");
  const content = document.getElementById("userAccountContent");
  if (!modal || !content || !currentUser) return;

  content.innerHTML = `<div style="text-align:center;padding:30px;">⏳ Đang tải thông tin tài khoản...</div>`;
  modal.classList.remove("hidden");

  try {
    const ordersRes = await API.getOrders(authToken);
    const myOrders = (ordersRes.data || []).filter(
      (o) => (o.customerEmail && o.customerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
             (o.customerPhone && currentUser.phone && o.customerPhone === currentUser.phone)
    );

    content.innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;background:var(--bg-sage);padding:18px;border-radius:var(--radius-md);margin-bottom:20px;">
        <div style="width:50px;height:50px;border-radius:50%;background:var(--color-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;">
          ${escapeHTML(currentUser.name ? currentUser.name[0].toUpperCase() : "U")}
        </div>
        <div style="flex-grow:1;">
          <h4 style="font-size:16px;margin-bottom:3px;">${escapeHTML(currentUser.name)}</h4>
          <div style="font-size:12.5px;color:var(--text-muted);">${escapeHTML(currentUser.email)} • SĐT: ${escapeHTML(currentUser.phone || "Chưa cập nhật")}</div>
        </div>
        <button class="btn-secondary" style="font-size:11.5px;padding:8px 14px;" onclick="handleLogout()">Đăng Xuất</button>
      </div>

      <h4 style="font-size:15px;margin-bottom:12px;" class="serif-font">Lịch Sử Mua Hàng (${myOrders.length} đơn)</h4>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border-light);border-radius:var(--radius-sm);">
        ${myOrders.length === 0 ? `
          <div style="padding:25px;text-align:center;color:var(--text-muted);font-size:13px;">Bạn chưa có đơn hàng nào tại Blushé Beauty.</div>
        ` : `
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead>
              <tr style="background:var(--bg-body);text-align:left;border-bottom:1px solid var(--border-light);">
                <th style="padding:10px 14px;">Mã đơn</th>
                <th style="padding:10px 14px;">Ngày đặt</th>
                <th style="padding:10px 14px;">Tổng tiền</th>
                <th style="padding:10px 14px;">Thanh toán</th>
                <th style="padding:10px 14px;">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              ${myOrders.map((o) => `
                <tr style="border-bottom:1px solid var(--border-light);">
                  <td style="padding:10px 14px;"><strong>#${o.orderCode || o._id.slice(-6).toUpperCase()}</strong></td>
                  <td style="padding:10px 14px;">${new Date(o.createdAt).toLocaleDateString("vi-VN")}</td>
                  <td style="padding:10px 14px;color:var(--color-accent);font-weight:bold;">${formatPrice(o.totalAmount)}</td>
                  <td style="padding:10px 14px;">${o.paymentMethod}</td>
                  <td style="padding:10px 14px;"><span style="background:var(--bg-sage);padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600;">${o.orderStatus}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div style="color:#C26B6B;">Không thể tải lịch sử đơn hàng.</div>`;
  }
}

function closeUserAccountModal() {
  document.getElementById("userAccountModal")?.classList.add("hidden");
}

function handleLogout() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("BLUSHE_TOKEN");
  localStorage.removeItem("BLUSHE_USER");
  updateAuthUI();
  closeUserAccountModal();
  showToast("Đã đăng xuất tài khoản an toàn.");
}

// 14. TRA CỨU ĐƠN HÀNG (ORDER TRACKING)
function openTrackOrderModal() {
  document.getElementById("trackOrderModal")?.classList.remove("hidden");
}

function closeTrackOrderModal() {
  document.getElementById("trackOrderModal")?.classList.add("hidden");
}

async function handleTrackOrderSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("trackOrderInput");
  const result = document.getElementById("trackOrderResult");
  if (!input || !result) return;

  const code = input.value.trim().toUpperCase();
  result.innerHTML = `<div>⏳ Đang tra cứu mã đơn #${code}...</div>`;

  try {
    const res = await API.getOrders();
    if (res.success && Array.isArray(res.data)) {
      const order = res.data.find(
        (o) => (o.orderCode && o.orderCode.toUpperCase() === code) ||
               (o._id && o._id.toUpperCase().endsWith(code.replace("#", "")))
      );

      if (!order) {
        result.innerHTML = `<div style="color:#C26B6B;padding:15px;background:#FFF0F0;border-radius:var(--radius-sm);font-size:13px;">Không tìm thấy đơn hàng có mã <strong>#${code}</strong>. Vui lòng kiểm tra lại mã trên hóa đơn hoặc tin nhắn.</div>`;
        return;
      }

      const statusMap = {
        PENDING: "Chờ duyệt",
        CONFIRMED: "Đã xác nhận",
        SHIPPING: "Đang giao hàng",
        COMPLETED: "Giao thành công",
        CANCELLED: "Đã hủy"
      };

      result.innerHTML = `
        <div style="background:var(--bg-sage);border:1px solid var(--border-light);padding:18px;border-radius:var(--radius-md);">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <strong style="color:var(--color-accent);font-size:15px;">#${order.orderCode || order._id}</strong>
            <span style="background:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;">${statusMap[order.orderStatus] || order.orderStatus}</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-main);line-height:1.8;">
            <div>Người nhận: <strong>${escapeHTML(order.customerName)}</strong> - ${escapeHTML(order.customerPhone)}</div>
            <div>Địa chỉ giao: ${escapeHTML(order.shippingAddress)}</div>
            <div>Hình thức thanh toán: <strong>${order.paymentMethod}</strong> (${order.paymentStatus === "PAID" ? "Đã thanh toán ✓" : "Chưa thanh toán"})</div>
            <div>Tổng thanh toán: <strong style="color:var(--color-accent);font-size:14px;">${formatPrice(order.totalAmount)}</strong></div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    result.innerHTML = `<div style="color:#C26B6B;">Lỗi khi tra cứu đơn hàng.</div>`;
  }
}

// TOAST THÔNG BÁO NHẸ
function showToast(msg) {
  const toast = document.createElement("div");
  toast.innerText = msg;
  toast.style.position = "fixed";
  toast.style.bottom = "90px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "rgba(48, 58, 48, 0.95)";
  toast.style.color = "#FFFFFF";
  toast.style.padding = "10px 22px";
  toast.style.borderRadius = "30px";
  toast.style.fontSize = "13px";
  toast.style.zIndex = "999";
  toast.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2800);
}
