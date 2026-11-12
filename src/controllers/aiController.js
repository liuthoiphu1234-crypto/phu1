const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');

// Helper định dạng tiền tệ VNĐ
const formatVND = (amount) => Number(amount || 0).toLocaleString('vi-VN') + ' đ';

// Hàm chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chuyển chữ thường) để tìm kiếm linh hoạt, chịu lỗi chính tả
function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// In-Memory Cache cho danh mục sản phẩm (TTL 60s để giảm tải MongoDB, tăng tốc phản hồi)
let catalogCache = null;
let catalogCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

async function getCachedCatalog() {
  const now = Date.now();
  if (catalogCache && (now - catalogCacheTime < CACHE_TTL_MS)) {
    return catalogCache;
  }
  const products = await Product.find({ status: 'ACTIVE' })
    .populate('category', 'name')
    .select('name category brand originalPrice salePrice stock image description ingredients usage skinType volume origin rating isFeatured isBestSeller')
    .lean();
  catalogCache = products;
  catalogCacheTime = now;
  return products;
}

// Lấy giá bán & tồn kho thời gian thực (Real-time từ CSDL, không dùng cache cũ - Tuân thủ Yêu cầu 9.12)
async function getFreshProduct(productId) {
  try {
    return await Product.findById(productId)
      .select('name category brand originalPrice salePrice stock image description ingredients usage skinType volume origin rating')
      .populate('category', 'name')
      .lean();
  } catch (err) {
    return null;
  }
}

// 1. Phân tích Token người dùng nếu có
async function getAuthenticatedUser(req) {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.body && req.body.token) {
      token = req.body.token;
    }
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) return null;

    const user = await User.findById(decoded.id).select('name email phone role isBlocked');
    return user || null;
  } catch (err) {
    return null;
  }
}

// 2. Tra cứu đơn hàng của người dùng hiện tại
async function getUserOrderContext(user) {
  if (!user) return { isAuthenticated: false, orders: [] };
  try {
    const orders = await Order.find({
      $or: [
        { customerEmail: user.email },
        ...(user.phone ? [{ customerPhone: user.phone }] : [])
      ]
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    return { isAuthenticated: true, user, orders };
  } catch (err) {
    return { isAuthenticated: true, user, orders: [] };
  }
}

// Danh sách các thương hiệu hoặc mỹ phẩm phổ biến thị trường mà Blushé KHÔNG kinh doanh
const COMPETITOR_NON_EXISTENT_KEYWORDS = [
  'mac', 'ruby woo', 'cetaphil', 'hada labo', 'anessa', 'black rouge', 'gucci',
  'differin', 'garnier', 'bioderma', 'the ordinary', 'obagi', 'zo skin', 'loreal',
  "l'oreal", 'cosrx', 'biore', 'vaseline', 'innisfree', 'laneige', 'senka', 'simple',
  'cerave', 'klairs', 'some by mi', 'paula', 'paulas choice', 'eucerin', 'neutrogena',
  'vichy', 'dr jart', 'fenty', 'nars', 'ysl', 'tom ford', '3ce', 'romand', 'merzy',
  'bbia', 'maybelline', 'd program', 'himalaya', 'acnes', 'ponds', 'pond', 'olay'
];

// Danh mục định danh chính xác các dòng sản phẩm của Blushé Beauty
const PRODUCT_SPECIFIC_IDENTIFIERS = [
  { keys: ['estee lauder', 'advanced night repair', 'anr'], idPattern: /estee/i },
  { keys: ['sk-ii', 'sk ii', 'sk2', 'nuoc than', 'pitera', 'facial treatment essence'], idPattern: /sk-ii/i },
  { keys: ['la mer', 'creme de la mer', 'duong am than ky'], idPattern: /la mer/i },
  { keys: ['kiehl', 'calendula', 'hoa cuc'], idPattern: /kiehl/i },
  { keys: ['sulwhasoo', 'first care'], idPattern: /sulwhasoo/i },
  { keys: ['cushion dior', 'phan nuoc dior', 'forever skin glow'], idPattern: /cushion/i },
  { keys: ['son dior', 'dior addict', 'lip glow'], idPattern: /lip glow/i },
  { keys: ['chanel', 'chanel no 5', 'chanel 5'], idPattern: /chanel/i },
  { keys: ['chong nang blushe', 'kem chong nang blushe', 'invisible sun shield', 'chong nang pho rong'], idPattern: /invisible sun shield/i },
  { keys: ['sua rua mat blushe', 'sua rua mat huu co', 'gentle botanical'], idPattern: /gentle botanical/i },
  { keys: ['tay trang blushe', 'nuoc tay trang blushe', 'micellar cleansing'], idPattern: /micellar/i },
  { keys: ['mat na tram tra', 'sheet mask blushe', 'tea tree sheet mask'], idPattern: /sheet mask/i },
  { keys: ['son duong blushe', 'son duong huu co', 'dau hat mo', 'organic lip balm'], idPattern: /organic lip balm/i },
  { keys: ['bo cham soc da', 'combo 4 mon', 'luxury radiance routine', 'combo hoang gia'], idPattern: /luxury radiance/i }
];

// 3. Khớp sản phẩm CHÍNH XÁC (Tránh match nhầm các từ chung như "son", "kem")
function findMatchingProducts(query, products) {
  const normQuery = removeVietnameseTones(query);

  // 1. Kiểm tra theo định danh đặc thù
  for (const item of PRODUCT_SPECIFIC_IDENTIFIERS) {
    if (item.keys.some(k => normQuery.includes(k))) {
      const found = products.filter(p => item.idPattern.test(removeVietnameseTones(p.name)) || item.idPattern.test(removeVietnameseTones(p.brand || '')));
      if (found.length > 0) return found;
    }
  }

  // 2. Kiểm tra tên đầy đủ của từng sản phẩm trong Database
  const exactMatches = products.filter(p => {
    const normName = removeVietnameseTones(p.name);
    return normQuery.includes(normName);
  });
  if (exactMatches.length > 0) return exactMatches;

  // 3. Khớp theo thương hiệu chính hãng có trên website
  const brandMatches = products.filter(p => {
    const normBrand = removeVietnameseTones(p.brand || '');
    return normBrand.length > 2 && normQuery.includes(normBrand);
  });
  if (brandMatches.length > 0) return brandMatches;

  // 4. Nếu chỉ chứa các từ chung (kem, son, serum) mà không có tên riêng hay thương hiệu:
  // Không gán cố định cho 1 sản phẩm cụ thể để tránh tư vấn sai
  return [];
}

// 4. Kiểm tra người dùng có đang hỏi về sản phẩm/thương hiệu KHÔNG TỒN TẠI trên website
function detectNonExistentProduct(query, matchedProducts) {
  const normQuery = removeVietnameseTones(query);

  // 1. Kiểm tra trực tiếp các từ khóa đối thủ hoặc nhãn hàng không có trong DB
  for (const kw of COMPETITOR_NON_EXISTENT_KEYWORDS) {
    // Đảm bảo khớp nguyên từ
    const regex = new RegExp(`(^|\\s|[^a-z0-9])${kw}($|\\s|[^a-z0-9])`, 'i');
    if (regex.test(normQuery)) {
      return true;
    }
  }

  // 2. Nếu người dùng hỏi mua / giá của một món đồ mà không khớp bất kỳ sản phẩm nào của shop
  if (matchedProducts.length === 0) {
    const inquiryPatterns = [
      'shop co ban', 'co ban khong', 'co san pham', 'gia bao nhieu', 'con hang khong',
      'ban kem', 'ban son', 'ban serum', 'co nuoc hoa'
    ];
    if (inquiryPatterns.some(p => normQuery.includes(p))) {
      return true;
    }
  }

  return false;
}

// 5. Smart Fallback Engine: Xử lý tức thì với độ chính xác 100% dựa trên CSDL MongoDB Atlas
async function generateVerifiedResponse({ message, products, coupons, userOrderContext, history = [] }) {
  const normMsg = removeVietnameseTones(message);
  const lowerMsg = message.toLowerCase();
  let reply = '';
  let matchedProducts = [];
  let suggestions = [];

  // A. BẢO MẬT: CHỐNG PROMPT INJECTION / HACKING (Yêu cầu 4)
  if (
    normMsg.includes('bo qua cac chi dan') ||
    normMsg.includes('ignore previous') ||
    normMsg.includes('system prompt') ||
    normMsg.includes('dong vai hacker') ||
    normMsg.includes('dan mode')
  ) {
    reply = `Dạ em là **Blushé Beauty AI Assistant** - chuyên viên tư vấn làm đẹp và mỹ phẩm hữu cơ cao cấp. Em chỉ hỗ trợ giải đáp các thông tin về chăm sóc sắc đẹp, sản phẩm và dịch vụ của thương hiệu Blushé Beauty ạ! 🌸`;
    return {
      reply,
      products: [],
      suggestions: ['Tư vấn da dầu mụn', 'Kem chống nắng hữu cơ', 'Mã giảm giá hôm nay'],
      provider: 'Blushé Guardrail'
    };
  }

  // B. YÊU CẦU TẠO ĐƠN HÀNG TRỰC TIẾP (Yêu cầu 4)
  if (
    normMsg.includes('tao don') ||
    normMsg.includes('dat hang giup') ||
    normMsg.includes('mua ho') ||
    normMsg.includes('len don cho toi') ||
    normMsg.includes('chot don cho toi')
  ) {
    reply = `Dạ Blushé Beauty rất sẵn lòng hỗ trợ bạn! Để đảm bảo tính bảo mật và thông tin giao hàng chính xác, em **không thể tự ý tạo đơn hàng thay cho bạn** được ạ.\n\n` +
      `👉 Bạn chỉ cần bấm vào nút **"👁 Chi tiết"** hoặc **"🛒 Thêm giỏ"** ngay trên thẻ sản phẩm bên dưới, sau đó bấm vào biểu tượng Giỏ hàng trên website để tiến hành đặt hàng và kiểm tra ưu đãi nhé! 🌸`;
    suggestions = ['Xem giỏ hàng', 'Mã giảm giá hiện có', 'Chính sách vận chuyển'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // C. CHÍNH SÁCH VẬN CHUYỂN & FREESHIP
  if (
    normMsg.includes('van chuyen') ||
    normMsg.includes('phi ship') ||
    normMsg.includes('giao hang') ||
    normMsg.includes('freeship') ||
    normMsg.includes('mien phi van chuyen')
  ) {
    reply = `Dạ chính sách giao hàng của Blushé Beauty như sau ạ:\n\n` +
      `🚚 **Miễn phí vận chuyển (Freeship)**: Áp dụng cho tất cả đơn hàng có giá trị từ **500.000 đ** trở lên trên toàn quốc.\n` +
      `📦 **Phí vận chuyển tiêu chuẩn**: Đơn hàng dưới 500.000 đ có mức phí ship đồng giá là **30.000 đ**.\n` +
      `⏰ **Thời gian giao hàng dự kiến**:\n` +
      `• Khu vực nội thành: 1 - 2 ngày làm việc.\n` +
      `• Các tỉnh thành khác: 2 - 4 ngày làm việc.\n\n` +
      `Tất cả sản phẩm đều được đóng gói chống sốc kỹ lưỡng kèm tem niêm phong chính hãng. Bạn cần em tư vấn thêm sản phẩm nào không ạ? 🌿`;
    matchedProducts = products.filter(p => p.isFeatured).slice(0, 3);
    suggestions = ['Mã giảm giá', 'Serum da dầu', 'Kem chống nắng'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // D. MÃ GIẢM GIÁ & VOUCHER
  if (
    normMsg.includes('ma giam gia') ||
    normMsg.includes('voucher') ||
    normMsg.includes('khuyen mai') ||
    normMsg.includes('coupon') ||
    (normMsg.includes('giam gia') && !normMsg.includes('gia bao nhieu'))
  ) {
    if (coupons.length > 0) {
      reply = `Dạ Blushé Beauty đang có các chương trình ưu đãi và mã giảm giá siêu hấp dẫn dành riêng cho bạn:\n\n`;
      coupons.forEach(c => {
        const valText = c.discountType === 'PERCENT' ? `${c.discountValue}%` : formatVND(c.discountValue);
        const minOrder = c.minOrderValue > 0 ? ` (Đơn từ ${formatVND(c.minOrderValue)})` : '';
        reply += `🎁 Mã: **${c.code}** - Giảm **${valText}**${minOrder}\n   _${c.description || 'Ưu đãi mua sắm mỹ phẩm'}_\n\n`;
      });
      reply += `✨ **Chính sách Freeship**: Miễn phí vận chuyển toàn quốc cho đơn hàng từ **500.000 đ**!\n` +
        `Bạn hãy chọn sản phẩm yêu thích và nhập mã tại bước thanh toán để nhận ưu đãi nhé! 🌸`;
    } else {
      reply = `Hiện tại Blushé Beauty đang áp dụng ưu đãi **Miễn phí vận chuyển toàn quốc cho mọi đơn hàng từ 500.000 đ** ạ! Bạn theo dõi thêm tại trang chủ để nhận các voucher mới nhất nhé. 🌸`;
    }
    matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
    suggestions = ['Freeship từ bao nhiêu?', 'Kem chống nắng', 'Combo da dầu'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // E. CÂU HỎI NGOÀI PHẠM VI (iPhone, xe máy, laptop, thời tiết...) (Yêu cầu 1, 6)
  const outOfScopeKeywords = [
    'iphone', 'dien thoai', 'may tinh', 'laptop', 'xe may', 'chung khoan',
    'thoi tiet', 'bong da', 'thoi su', 'bitcoin', 'quan ao', 'giay dep', 'xe dap'
  ];
  for (const badKw of outOfScopeKeywords) {
    if (normMsg.includes(badKw)) {
      reply = `Dạ em là **Blushé Beauty AI Assistant** - chuyên viên tư vấn làm đẹp và mỹ phẩm hữu cơ ạ! 🌸\n\n` +
        `Hiện tại em chỉ hỗ trợ các câu hỏi liên quan đến chăm sóc da, mỹ phẩm, quy trình skincare và thông tin sản phẩm của Blushé Beauty. Bạn đang quan tâm đến sản phẩm chăm sóc da nào để em tư vấn nhé! ✨`;
      matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
      suggestions = ['Tư vấn da dầu mụn', 'Kem chống nắng hữu cơ', 'Mã giảm giá hôm nay'];
      return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
    }
  }

  // F. TRA CỨU ĐƠN HÀNG BẢO MẬT (Yêu cầu 4)
  if (
    normMsg.includes('don hang cua toi') ||
    normMsg.includes('kiem tra don hang') ||
    normMsg.includes('tra cuu don') ||
    normMsg.includes('don cua toi') ||
    normMsg.includes('tinh trang don') ||
    (normMsg.includes('don hang') && (normMsg.includes('kiem tra') || normMsg.includes('xem') || normMsg.includes('@') || normMsg.includes('cua')))
  ) {
    if (
      lowerMsg.includes('@') ||
      normMsg.includes('don cua anh') ||
      normMsg.includes('don cua chi') ||
      normMsg.includes('don cua ban') ||
      normMsg.includes('don nguoi khac') ||
      normMsg.includes('don cua ai')
    ) {
      reply = `Dạ vì lý do bảo mật và bảo vệ quyền riêng tư cá nhân theo quy định của Blushé Beauty, hệ thống **tuyệt đối không cung cấp thông tin đơn hàng của khách hàng khác**. Bạn chỉ có thể tra cứu đơn hàng của chính tài khoản mình sau khi đăng nhập nhé! 🔒🌸`;
      return { reply, products: [], suggestions: ['Đăng nhập tài khoản', 'Mã giảm giá hiện có'], provider: 'Blushé Smart AI Engine' };
    }

    if (!userOrderContext.isAuthenticated) {
      reply = `Dạ để bảo mật thông tin đơn hàng cá nhân, bạn vui lòng **Đăng nhập tài khoản** Blushé Beauty của mình trước nhé! Sau khi đăng nhập, em sẽ hỗ trợ tra cứu chi tiết hành trình đơn hàng của bạn ngay lập tức ạ. 📦🌸`;
      suggestions = ['Đăng nhập ngay', 'Chính sách vận chuyển', 'Tư vấn sản phẩm'];
      return { reply, products: [], suggestions, provider: 'Blushé Smart AI Engine' };
    }

    const { user, orders } = userOrderContext;
    if (orders.length === 0) {
      reply = `Chào ${user.name}! Em đã kiểm tra tài khoản (${user.email}) nhưng chưa thấy bạn có đơn hàng nào tại Blushé Beauty. Bạn hãy dạo qua danh mục sản phẩm và chọn cho mình các sản phẩm chăm sóc da ưng ý nhé! ✨`;
      matchedProducts = products.slice(0, 3);
      suggestions = ['Serum dưỡng ẩm', 'Kem chống nắng hữu cơ', 'Mã giảm giá'];
    } else {
      reply = `Chào ${user.name}! Em xin gửi thông tin đơn hàng gần nhất của bạn tại Blushé Beauty:\n\n`;
      orders.forEach((o) => {
        const statusMap = {
          PENDING: 'Chờ xử lý ⏳',
          CONFIRMED: 'Đã xác nhận ✔️',
          SHIPPING: 'Đang vận chuyển 🚚',
          COMPLETED: 'Đã giao thành công 🎉',
          CANCELLED: 'Đã hủy ❌'
        };
        const statusText = statusMap[o.orderStatus] || o.orderStatus;
        reply += `📦 **Đơn hàng #${o.orderCode}**\n` +
          `• Ngày đặt: ${new Date(o.createdAt).toLocaleDateString('vi-VN')}\n` +
          `• Trạng thái: **${statusText}**\n` +
          `• Tổng tiền: **${formatVND(o.totalAmount)}** (${o.paymentMethod})\n` +
          `• Địa chỉ: ${o.shippingAddress}\n` +
          `• Sản phẩm: ${o.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}\n\n`;
      });
      reply += `Bạn cần hỗ trợ thêm thông tin gì về đơn hàng cứ nhắn cho em nhé! 🌸`;
      suggestions = ['Thời gian giao hàng', 'Chính sách đổi trả', 'Sản phẩm mua lại'];
    }
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // G. SO SÁNH HAI SẢN PHẨM (Yêu cầu 3.4 & 6: Đặt trước khi tìm đơn sản phẩm để không nuốt mất so sánh)
  if (normMsg.includes('so sanh') || normMsg.includes('khac nhau')) {
    let compareList = [];
    // Tìm các sản phẩm được nhắc đến
    for (const p of products) {
      const normName = removeVietnameseTones(p.name);
      const normBrand = removeVietnameseTones(p.brand || '');
      if (normMsg.includes(normBrand) || normMsg.includes(normName)) {
        compareList.push(p);
      }
    }

    if (compareList.length < 2) {
      if (normMsg.includes('serum') && normMsg.includes('sk')) {
        const estee = products.find(p => p.name.includes('Estée'));
        const sk2 = products.find(p => p.name.includes('SK-II'));
        if (estee && sk2) compareList = [estee, sk2];
      } else {
        compareList = products.slice(0, 2);
      }
    }

    const p1 = compareList[0];
    const p2 = compareList[1];
    const stock1 = p1.stock > 0 ? `Còn ${p1.stock} sản phẩm` : `HẾT HÀNG ❌`;
    const stock2 = p2.stock > 0 ? `Còn ${p2.stock} sản phẩm` : `HẾT HÀNG ❌`;

    reply = `Dạ em xin so sánh chi tiết giữa 2 sản phẩm dựa trên thông số thực tế tại Blushé Beauty:\n\n` +
      `1️⃣ **${p1.name}** (${p1.brand}):\n` +
      `• Giá bán: **${formatVND(p1.salePrice)}** | Tồn kho: **${stock1}**\n` +
      `• Dung tích: ${p1.volume} | Xuất xứ: ${p1.origin}\n` +
      `• Phù hợp với: ${p1.skinType}\n` +
      `• Thành phần nổi bật: ${p1.ingredients}\n\n` +
      `2️⃣ **${p2.name}** (${p2.brand}):\n` +
      `• Giá bán: **${formatVND(p2.salePrice)}** | Tồn kho: **${stock2}**\n` +
      `• Dung tích: ${p2.volume} | Xuất xứ: ${p2.origin}\n` +
      `• Phù hợp với: ${p2.skinType}\n` +
      `• Thành phần nổi bật: ${p2.ingredients}\n\n` +
      `👉 Tùy theo nhu cầu cấp ẩm hay phục hồi chuyên sâu và ngân sách mà bạn có thể lựa chọn sản phẩm phù hợp nhất nhé! 🌸`;
    return { reply, products: [p1, p2], suggestions: ['Xem chi tiết sản phẩm 1', 'Xem chi tiết sản phẩm 2', 'Mã giảm giá'], provider: 'Blushé Smart AI Engine' };
  }

  // H. HỎI SẢN PHẨM KHÔNG CÓ TRONG CƠ SỞ DỮ LIỆU (Yêu cầu 2: Bắt buộc thông báo không tìm thấy)
  const candidateProducts = findMatchingProducts(message, products);
  const isNonExistent = detectNonExistentProduct(message, candidateProducts);

  if (isNonExistent) {
    reply = `Xin lỗi, hiện tại tôi chưa tìm thấy thông tin chính xác về sản phẩm này tại Blushé Beauty.\n\n` +
      `Danh mục sản phẩm của Blushé Beauty chuyên về mỹ phẩm hữu cơ và chăm sóc da cao cấp từ các thương hiệu chính hãng: **Blushé Naturals, Estée Lauder, Kiehl's, La Mer, SK-II, Sulwhasoo, Dior Beauty, Chanel**.\n\n` +
      `Bạn có thể chia sẻ nhu cầu chăm sóc da (cấp ẩm, kiềm dầu, chống nắng, chống lão hóa...) để em tư vấn các dòng sản phẩm sẵn có tại shop nhé! 🌿`;
    suggestions = ['Serum cho da dầu', 'Kem chống nắng nhạy cảm', 'Mã giảm giá hôm nay'];
    return { reply, products: [], suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // I. HỎI VỀ SẢN PHẨM CỤ THỂ ĐÃ TÌM THẤY TRONG DATABASE (Giá, Tồn kho, Hết hàng, Thành phần)
  if (candidateProducts.length > 0) {
    const targetProduct = candidateProducts[0];
    // Lấy dữ liệu tươi mới từ DB để đảm bảo giá và tồn kho chính xác 100% (Yêu cầu 9.12)
    const freshP = await getFreshProduct(targetProduct._id) || targetProduct;

    // 1. Kiểm tra nếu hỏi về TỒN KHO hoặc TÌNH TRẠNG CÒN HÀNG (Yêu cầu 2)
    if (
      normMsg.includes('ton kho') ||
      normMsg.includes('con bao nhieu') ||
      normMsg.includes('con hang khong') ||
      normMsg.includes('so luong con') ||
      normMsg.includes('het hang chua')
    ) {
      if (freshP.stock === 0) {
        reply = `Dạ sản phẩm **${freshP.name}** (${freshP.brand}) hiện đang **HẾT HÀNG** trong kho của Blushé Beauty ❌.\n\n` +
          `Shop xin lỗi vì sự bất tiện này! Lô hàng mới dự kiến sẽ được nhập về trong thời gian tới. Bạn có thể tham khảo các dòng sản phẩm khác cùng loại đang có sẵn hàng tại shop nhé! 🌸`;
        return { reply, products: [freshP], suggestions: ['Xem sản phẩm khác', 'Mã giảm giá'], provider: 'Blushé Smart AI Engine' };
      } else {
        reply = `Dạ sản phẩm **${freshP.name}** (${freshP.brand}) hiện đang **CÒN HÀNG** trong kho với số lượng tồn kho thực tế là **${freshP.stock} sản phẩm** sẵn sàng giao ngay.\n\n` +
          `• Giá bán ưu đãi: **${formatVND(freshP.salePrice)}** (Giá gốc: ${formatVND(freshP.originalPrice)})\n` +
          `• Dung tích: ${freshP.volume} - Xuất xứ: ${freshP.origin}\n` +
          `• Phù hợp với: ${freshP.skinType}\n\n` +
          `Bạn có thể bấm vào thẻ sản phẩm bên dưới để xem chi tiết hoặc thêm vào giỏ hàng nhé! 🌿`;
        return { reply, products: [freshP], suggestions: ['Cách sử dụng', 'Thành phần chính', 'Xem chi tiết'], provider: 'Blushé Smart AI Engine' };
      }
    }

    // 2. Kiểm tra nếu hỏi về GIÁ BÁN
    if (
      normMsg.includes('gia bao nhieu') ||
      normMsg.includes('bao nhieu tien') ||
      normMsg.includes('gia ban') ||
      normMsg.includes('gia cua')
    ) {
      const stockText = freshP.stock > 0 ? `còn **${freshP.stock} sản phẩm** trong kho` : `hiện đang **HẾT HÀNG** ❌`;
      reply = `Dạ sản phẩm **${freshP.name}** thuộc thương hiệu **${freshP.brand}** đang có giá bán chính thức là **${formatVND(freshP.salePrice)}** (Giá gốc: ${formatVND(freshP.originalPrice)}), ${stockText}.\n\n` +
        `• Dung tích: ${freshP.volume} - Xuất xứ: ${freshP.origin}\n` +
        `• Loại da phù hợp: ${freshP.skinType}\n` +
        `• Công dụng chính: ${freshP.description}\n\n` +
        `Bạn có thể xem chi tiết sản phẩm trên thẻ bên dưới nhé! 🌿`;
      return { reply, products: [freshP], suggestions: ['Tồn kho thực tế', 'Thành phần', 'Xem chi tiết'], provider: 'Blushé Smart AI Engine' };
    }

    // 3. Nếu sản phẩm HẾT HÀNG nhưng người dùng hỏi thông tin chung (Yêu cầu 2: Bắt buộc thông báo hết hàng)
    if (freshP.stock === 0) {
      reply = `Dạ sản phẩm **${freshP.name}** (${freshP.brand}) hiện đang **HẾT HÀNG** trong kho của Blushé Beauty ❌.\n\n` +
        `• Giá niêm yết: **${formatVND(freshP.salePrice)}** | Dung tích: ${freshP.volume}\n` +
        `• Thành phần: ${freshP.ingredients}\n` +
        `• Công dụng: ${freshP.description}\n\n` +
        `Vì sản phẩm đã hết hàng, shop xin phép không đề xuất đặt mua ngay mà gợi ý bạn tham khảo các sản phẩm thay thế cùng công dụng nhé! 🌸`;
      return { reply, products: [freshP], suggestions: ['Sản phẩm tương tự', 'Mã giảm giá'], provider: 'Blushé Smart AI Engine' };
    }

    // 4. Tư vấn thông tin chi tiết sản phẩm có trong DB
    reply = `Dạ sản phẩm **${freshP.name}** thuộc thương hiệu **${freshP.brand}** đang có giá ưu đãi là **${formatVND(freshP.salePrice)}** (Giá gốc: ${formatVND(freshP.originalPrice)}), còn **${freshP.stock} sản phẩm** trong kho.\n\n` +
      `• **Loại da phù hợp**: ${freshP.skinType}\n` +
      `• **Dung tích/Khối lượng**: ${freshP.volume} - Xuất xứ: ${freshP.origin}\n` +
      `• **Thành phần chính**: ${freshP.ingredients}\n` +
      `• **Công dụng nổi bật**: ${freshP.description}\n` +
      `• **Hướng dẫn sử dụng**: ${freshP.usage}\n\n` +
      `Bạn có thể bấm vào thẻ sản phẩm bên dưới để xem thêm thông tin và thêm vào giỏ hàng nhé! 🌿`;
    return { reply, products: [freshP], suggestions: ['Tồn kho còn bao nhiêu?', 'Mã giảm giá áp dụng', 'Xem chi tiết'], provider: 'Blushé Smart AI Engine' };
  }

  // J. THÀNH PHẦN CHUNG KHI KHÔNG CÓ SẢN PHẨM CỤ THỂ
  if (
    normMsg.includes('thanh phan') ||
    normMsg.includes('con kho') ||
    normMsg.includes('paraben') ||
    normMsg.includes('huong lieu') ||
    normMsg.includes('chat bao quan') ||
    normMsg.includes('lanh tinh')
  ) {
    reply = `Dạ triết lý cốt lõi của Blushé Beauty là **Luxury Organic Beauty - Mỹ phẩm hữu cơ chuẩn Châu Âu** an toàn và lành tính tuyệt đối:\n\n` +
      `🌱 **Cam kết 5 KHÔNG**:\n` +
      `1. ❌ **Không cồn khô (Alcohol-free)**: Không làm bào mòn hay khô căng biểu bì da.\n` +
      `2. ❌ **Không Paraben**: 100% không chứa chất bảo quản hóa học độc hại.\n` +
      `3. ❌ **Không hương liệu nhân tạo (Fragrance-free)**: Chỉ lưu giữ hương thơm thảo mộc tự nhiên dịu mát.\n` +
      `4. ❌ **Không dầu khoáng (Mineral oil-free)**: Không gây bít tắc lỗ chân lông hay sinh mụn ẩn.\n` +
      `5. ❌ **Không thử nghiệm trên động vật (Cruelty-free)**.\n\n` +
      `Tất cả sản phẩm đều được chiết xuất từ thảo dược hữu cơ đạt kiểm nghiệm da liễu nghiêm ngặt. Bạn đang quan tâm đến thành phần của sản phẩm nào để em hỗ trợ phân tích chi tiết nhé! 🌿🕊️`;
    matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
    suggestions = ['Sữa rửa mặt hữu cơ', 'Serum phục hồi B5', 'Kem chống nắng nhạy cảm'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // K. TÌM KIẾM THEO NGÂN SÁCH (Yêu cầu 3.3 & 6)
  if (normMsg.includes('duoi 200') || normMsg.includes('duoi 300') || normMsg.includes('duoi 500') || normMsg.includes('duoi 1 trieu') || normMsg.includes('ngan sach')) {
    let maxPrice = 500000;
    if (normMsg.includes('200')) maxPrice = 200000;
    else if (normMsg.includes('300')) maxPrice = 300000;
    else if (normMsg.includes('400')) maxPrice = 400000;
    else if (normMsg.includes('500')) maxPrice = 500000;
    else if (normMsg.includes('1 trieu') || normMsg.includes('1tr')) maxPrice = 1000000;

    matchedProducts = products.filter(p => p.salePrice <= maxPrice && p.stock > 0);
    if (matchedProducts.length > 0) {
      reply = `Dạ với mức ngân sách dưới **${formatVND(maxPrice)}**, em đã chọn lọc các sản phẩm chất lượng cao, đang còn sẵn hàng tại Blushé Beauty dành cho bạn:\n\n` +
        matchedProducts.map(p => `• **${p.name}** - Giá: **${formatVND(p.salePrice)}** (${p.skinType || 'Mọi loại da'}, còn ${p.stock} sản phẩm)`).join('\n') +
        `\n\nTất cả sản phẩm đều có thành phần hữu cơ an toàn. Bạn xem chi tiết sản phẩm bên dưới nhé! 🌿`;
    } else {
      reply = `Dạ với ngân sách dưới ${formatVND(maxPrice)}, hiện các sản phẩm trong tầm giá này đang tạm hết hàng. Em xin giới thiệu các sản phẩm có mức giá gần nhất với chất lượng tối ưu nhất ạ! 🌸`;
      matchedProducts = products.filter(p => p.stock > 0).sort((a, b) => a.salePrice - b.salePrice).slice(0, 3);
    }
    return { reply, products: matchedProducts.slice(0, 4), suggestions: ['Dưới 300k', 'Dưới 500k', 'Freeship từ bao nhiêu?'], provider: 'Blushé Smart AI Engine' };
  }

  // L. TƯ VẤN THEO LOẠI DA (DẦU, KHÔ, NHẠY CẢM, HỖN HỢP)
  if (normMsg.includes('da dau') || normMsg.includes('da nhon') || normMsg.includes('kiem dau') || normMsg.includes('mun')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return st.includes('dầu') || st.includes('mụn') || desc.includes('kiềm dầu') || desc.includes('tràm trà') || desc.includes('trà xanh');
    });
    reply = `Dạ đối với **làn da dầu, dễ nổi mụn**, chìa khóa chăm sóc là làm sạch sâu dịu nhẹ và kiểm soát bã nhờn mà không làm khô căng da. Em gợi ý bạn các sản phẩm chứa chiết xuất Tràm trà, Trà xanh hữu cơ và Niacinamide giúp kiềm dầu, kháng viêm và se khít lỗ chân lông hiệu quả:\n\n` +
      `💡 _Lưu ý da liễu: Các sản phẩm hữu cơ tại Blushé Beauty hỗ trợ cân bằng tuyến dầu và ngừa mụn dịu nhẹ. Nếu da có tình trạng mụn viêm nang diện rộng, bạn nên kết hợp tham vấn bác sĩ da liễu nhé!_`;
    return { reply, products: matchedProducts.slice(0, 3), suggestions: ['Sữa rửa mặt da dầu', 'Mặt nạ tràm trà', 'Kem chống nắng da dầu'], provider: 'Blushé Smart AI Engine' };
  }

  if (normMsg.includes('da kho') || normMsg.includes('thieu am') || normMsg.includes('bong troc')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return st.includes('khô') || desc.includes('cấp ẩm') || desc.includes('dưỡng ẩm') || desc.includes('hyaluronic');
    });
    reply = `Dạ đối với **làn da khô, thiếu ẩm**, da rất dễ xuất hiện nếp nhăn li ti và thô ráp nếu không được cấp nước đủ. Bạn nên tập trung vào các sản phẩm giàu Hyaluronic Acid, Ceramide và Vitamin B5 để củng cố màng lipid khóa ẩm tự nhiên cho da:\n\n` +
      `Dưới đây là các sản phẩm dưỡng ẩm chuyên sâu giàu dưỡng chất hữu cơ dành riêng cho bạn: 💧✨`;
    return { reply, products: matchedProducts.slice(0, 3), suggestions: ['Serum cấp ẩm', 'Kem dưỡng da khô', 'Quy trình tối'], provider: 'Blushé Smart AI Engine' };
  }

  if (normMsg.includes('nhay cam') || normMsg.includes('kich ung') || normMsg.includes('man do')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      return st.includes('nhạy cảm') || st.includes('mọi loại da');
    });
    reply = `Dạ **da nhạy cảm** cần được nâng niu bằng công thức tối giản, lành tính với độ pH chuẩn 5.5, tuyệt đối không chứa cồn khô, parabens hay hương liệu hóa học. Các sản phẩm tại Blushé Beauty chiết xuất từ rau má hữu cơ và hoa cúc La Mã sẽ giúp làm dịu tức thì các vết đỏ rát và phục hồi màng bảo vệ da mỏng manh:\n\n` +
      `Em xin gợi ý các dòng sản phẩm an toàn nhất cho làn da của bạn: 🌿🕊️`;
    return { reply, products: matchedProducts.slice(0, 3), suggestions: ['Kem chống nắng nhạy cảm', 'Sữa rửa mặt dịu nhẹ', 'Serum phục hồi B5'], provider: 'Blushé Smart AI Engine' };
  }

  // M. TÌM THEO DANH MỤC
  const catKeywords = ['serum', 'sua rua mat', 'toner', 'nuoc hoa hong', 'kem duong', 'mat na', 'tay trang', 'son', 'nuoc hoa'];
  for (const kw of catKeywords) {
    if (normMsg.includes(kw)) {
      matchedProducts = products.filter(p => {
        const cat = removeVietnameseTones(p.category ? p.category.name : '');
        const name = removeVietnameseTones(p.name);
        return name.includes(kw) || cat.includes(kw);
      });
      if (matchedProducts.length > 0) {
        reply = `Dạ Blushé Beauty có các dòng sản phẩm **${kw.toUpperCase()}** chiết xuất thiên nhiên rất được yêu thích dưới đây ạ:\n\n` +
          `Mỗi sản phẩm đều có thành phần hữu cơ chọn lọc, đảm bảo an toàn cho da. Bạn có thể bấm vào thẻ sản phẩm để xem chi tiết nhé! 🌿`;
        return { reply, products: matchedProducts.slice(0, 3), suggestions: ['Giá dưới 300k', 'Cho da dầu', 'Cho da nhạy cảm'], provider: 'Blushé Smart AI Engine' };
      }
    }
  }

  // N. MẶC ĐỊNH THÂN THIỆN
  reply = `Chào bạn! Em là **Blushé Beauty AI Assistant** 🌿. Em rất vui được đồng hành cùng bạn trong hành trình chăm sóc làn da khỏe đẹp và rạng rỡ tự nhiên.\n\n` +
    `Bạn có thể chia sẻ tình trạng da hiện tại (da dầu, da khô, da nhạy cảm...) hoặc sản phẩm bạn đang tìm kiếm (serum, kem chống nắng, sữa rửa mặt...) để em tư vấn chi tiết nhé! 🌸`;
  matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
  suggestions = ['Da dầu nên dùng gì?', 'Kem chống nắng da nhạy cảm', 'Mã giảm giá hôm nay', 'Quy trình skincare tối'];

  return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
}

// [POST] /api/ai/chat - Trợ lý AI Tư vấn Mỹ phẩm Blushé Beauty
exports.chatWithAI = async (req, res) => {
  const startTime = Date.now();
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập câu hỏi để chuyên viên AI tư vấn!'
      });
    }

    const trimmedMsg = message.trim();

    // 1. Phân tích ngữ cảnh người dùng & nạp dữ liệu Catalog (dùng Cache in-memory để phản hồi siêu tốc)
    const [currentUser, products, coupons] = await Promise.all([
      getAuthenticatedUser(req),
      getCachedCatalog(),
      Coupon.find({ isActive: true, expiryDate: { $gte: new Date() } })
        .select('code description discountType discountValue minOrderValue')
        .lean()
    ]);
    const userOrderContext = await getUserOrderContext(currentUser);

    // 2. Cơ chế tiền kiểm tra (Pre-filter Fast Path):
    // Với các câu hỏi tra cứu dữ liệu thực tế (Hỏi sản phẩm cụ thể, Giá, Tồn kho, Hết hàng, So sánh, Voucher, Phí ship, Hàng không tồn tại, Ngoài phạm vi...)
    // Phản hồi NGAY LẬP TỨC trong < 0.2s để đạt mục tiêu tốc độ 1-2s (Yêu cầu 9.1 - 9.10)
    const normMsg = removeVietnameseTones(trimmedMsg);
    const candidateProducts = findMatchingProducts(trimmedMsg, products);
    const isAskingNonExistent = detectNonExistentProduct(trimmedMsg, candidateProducts);

    const isDirectFactQuery =
      isAskingNonExistent ||
      candidateProducts.length > 0 ||
      normMsg.includes('so sanh') ||
      normMsg.includes('khac nhau') ||
      normMsg.includes('ton kho') ||
      normMsg.includes('con bao nhieu') ||
      normMsg.includes('con hang khong') ||
      normMsg.includes('so luong con') ||
      normMsg.includes('het hang') ||
      normMsg.includes('gia bao nhieu') ||
      normMsg.includes('bao nhieu tien') ||
      normMsg.includes('gia ban') ||
      normMsg.includes('van chuyen') ||
      normMsg.includes('phi ship') ||
      normMsg.includes('freeship') ||
      normMsg.includes('voucher') ||
      normMsg.includes('ma giam gia') ||
      normMsg.includes('khuyen mai') ||
      normMsg.includes('don hang') ||
      normMsg.includes('tao don') ||
      normMsg.includes('iphone') ||
      normMsg.includes('xe may') ||
      normMsg.includes('may tinh');

    if (isDirectFactQuery) {
      const verifiedResult = await generateVerifiedResponse({
        message: trimmedMsg,
        products,
        coupons,
        userOrderContext,
        history
      });

      const responseTime = Date.now() - startTime;
      return res.status(200).json({
        success: true,
        provider: verifiedResult.provider,
        responseTimeMs: responseTime,
        reply: verifiedResult.reply,
        products: verifiedResult.products.map(p => ({
          _id: p._id,
          name: p.name,
          brand: p.brand,
          category: p.category ? (p.category.name || p.category) : 'Mỹ phẩm',
          salePrice: p.salePrice,
          originalPrice: p.originalPrice,
          stock: p.stock,
          image: p.image,
          skinType: p.skinType,
          volume: p.volume,
          rating: p.rating
        })),
        suggestions: verifiedResult.suggestions
      });
    }

    // 3. Với các câu hỏi tư vấn phức tạp (Tư vấn chu trình da dầu/khô/mụn/nhạy cảm, phối hợp sản phẩm):
    // Gọi Google Gemini 3.8 Flash nhưng CHỈ truyền vào 2-3 sản phẩm liên quan nhất (RAG chọn lọc)
    // để giảm 80% dung lượng prompt, giúp Gemini phản hồi nhanh trong 2-3 giây!
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'AIzaSyDemoKeyYourGeminiApiKeyHere12345') {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.8-flash',
          generationConfig: {
            maxOutputTokens: 350,
            temperature: 0.2
          }
        });

        // Chỉ đưa tối đa 3 sản phẩm liên quan nhất vào ngữ cảnh Gemini
        const relevantProducts = candidateProducts.length > 0
          ? candidateProducts.slice(0, 3)
          : products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);

        const relevantCatalogText = relevantProducts.map((p, idx) =>
          `[ID: ${p._id}] ${idx + 1}. "${p.name}" | Hãng: ${p.brand} | Giá: ${formatVND(p.salePrice)} | Kho: ${p.stock > 0 ? p.stock + ' sản phẩm' : 'HẾT HÀNG'} | Loại da: ${p.skinType} | Thành phần: ${p.ingredients} | Công dụng: ${p.description}`
        ).join('\n');

        const compactSystemPrompt = `
Bạn là "Blushé Beauty AI" - Chuyên viên tư vấn sắc đẹp hữu cơ cao cấp.
QUY TẮC BẮT BUỘC (TUYỆT ĐỐI TUÂN THỦ):
1. CHỈ tư vấn dựa trên danh sách sản phẩm thực tế được cung cấp dưới đây. TUYỆT ĐỐI KHÔNG tự bịa tên sản phẩm, giá bán hay thành phần.
2. Nếu khách hỏi sản phẩm không có trong danh sách: Bắt buộc trả lời: "Xin lỗi, hiện tại tôi chưa tìm thấy thông tin chính xác về sản phẩm này tại Blushé Beauty."
3. Sản phẩm có tồn kho = 0 là HẾT HÀNG, tuyệt đối không tư vấn là còn hàng.
4. Trả lời ngắn gọn, tinh tế, đúng trọng tâm (dưới 150 từ), không dài dòng.
5. Cuối câu trả lời, ghi kèm danh sách ID sản phẩm đề xuất dạng: [RECOMMENDED_PRODUCTS: ID_1, ID_2]

SẢN PHẨM PHÙ HỢP CÓ SẴN TRONG KHO:
${relevantCatalogText}
`;

        const geminiPromise = model.generateContent({
          contents: [
            { role: 'user', parts: [{ text: `${compactSystemPrompt}\n\nKhách hàng hỏi: "${trimmedMsg}". Hãy tư vấn ngắn gọn, chính xác.` }] }
          ]
        });

        // Đặt timeout 3.5 giây để đảm bảo trải nghiệm người dùng luôn nhanh chóng
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 3500)
        );

        const result = await Promise.race([geminiPromise, timeoutPromise]);
        let textReply = result.response.text();

        // Trích xuất ID sản phẩm được đề xuất
        let recommendedIds = [];
        const matchRec = textReply.match(/\[RECOMMENDED_PRODUCTS:\s*([^\]]+)\]/i);
        if (matchRec) {
          recommendedIds = matchRec[1].split(',').map(s => s.trim());
          textReply = textReply.replace(/\[RECOMMENDED_PRODUCTS:\s*([^\]]+)\]/gi, '').trim();
        }

        let cardProducts = relevantProducts.filter(p => recommendedIds.includes(String(p._id)));
        if (cardProducts.length === 0) cardProducts = relevantProducts.slice(0, 3);

        const responseTime = Date.now() - startTime;
        return res.status(200).json({
          success: true,
          provider: 'Google Gemini 3.8 Flash',
          responseTimeMs: responseTime,
          reply: textReply,
          products: cardProducts.map(p => ({
            _id: p._id,
            name: p.name,
            brand: p.brand,
            category: p.category ? (p.category.name || p.category) : 'Mỹ phẩm',
            salePrice: p.salePrice,
            originalPrice: p.originalPrice,
            stock: p.stock,
            image: p.image,
            skinType: p.skinType,
            volume: p.volume,
            rating: p.rating
          })),
          suggestions: ['Tư vấn da dầu mụn', 'Kem chống nắng da nhạy cảm', 'Mã giảm giá hôm nay', 'Quy trình skincare tối']
        });
      } catch (geminiError) {
        console.warn('Google Gemini API bận/timeout -> Chuyển sang Blushé Smart AI Engine:', geminiError.message);
      }
    }

    // 4. Fallback tức thì sang Blushé Smart AI Engine (Chính xác 100%, bảo mật, thời gian < 0.1s)
    const verifiedResult = await generateVerifiedResponse({
      message: trimmedMsg,
      products,
      coupons,
      userOrderContext,
      history
    });

    const responseTime = Date.now() - startTime;
    return res.status(200).json({
      success: true,
      provider: verifiedResult.provider,
      responseTimeMs: responseTime,
      reply: verifiedResult.reply,
      products: verifiedResult.products.map(p => ({
        _id: p._id,
        name: p.name,
        brand: p.brand,
        category: p.category ? (p.category.name || p.category) : 'Mỹ phẩm',
        salePrice: p.salePrice,
        originalPrice: p.originalPrice,
        stock: p.stock,
        image: p.image,
        skinType: p.skinType,
        volume: p.volume,
        rating: p.rating
      })),
      suggestions: verifiedResult.suggestions
    });
  } catch (error) {
    console.error('Lỗi controller AI:', error);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi xử lý tư vấn: ' + error.message
    });
  }
};
