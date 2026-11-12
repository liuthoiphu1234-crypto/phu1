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

// Phân tích Token người dùng nếu có
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

// Tra cứu đơn hàng của người dùng hiện tại
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
  'bbia', 'maybelline', 'd program', 'himalaya', 'acnes', 'ponds', 'pond', 'olay',
  'sauvage', 'dior sauvage', 'bleu de chanel', 'klenzit', 'megaduo', 'derma forte',
  'strataderm', 'hiruscar', 'laroche posay', 'la roche posay', 'sVR'
];

function isCompetitorOrNonExistent(query) {
  const norm = removeVietnameseTones(query);
  for (const kw of COMPETITOR_NON_EXISTENT_KEYWORDS) {
    const regex = new RegExp(`(^|\\s|[^a-z0-9])${kw}($|\\s|[^a-z0-9])`, 'i');
    if (regex.test(norm)) return true;
  }
  return false;
}

// Danh mục định danh chi tiết từng sản phẩm trong cửa hàng Blushé Beauty
const PRODUCT_CATALOG_DEFINITIONS = [
  {
    id: 'cleanser',
    keywords: ['sua rua mat', 'rua mat', 'cleanser', 'gentle botanical'],
    brand: 'Blushé Naturals',
    matcher: (p) => /gentle botanical|sua rua mat/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'toner_kiehl',
    keywords: ['nuoc hoa hong', 'toner', 'kiehl', 'kiehls', 'calendula', 'hoa cuc', 'nuoc can bang'],
    brand: "Kiehl's",
    matcher: (p) => /kiehl|calendula|hoa cuc/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'serum_estee',
    keywords: ['serum estee', 'estee lauder', 'estee', 'advanced night repair', 'anr', 'serum ban dem', 'serum dem', 'phuc hoi ban dem', 'chong lao hoa estee'],
    brand: 'Estée Lauder',
    matcher: (p) => /estee|advanced night repair/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'creme_lamer',
    keywords: ['kem la mer', 'la mer', 'creme de la mer', 'duong am than ky', 'kem duong am', 'kem duong la mer', 'kem phuc hoi'],
    brand: 'La Mer',
    matcher: (p) => /la mer|creme de la mer/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'sunscreen_blushe',
    keywords: ['kem chong nang', 'chong nang', 'invisible sun shield', 'sun shield', 'spf50', 'chong nang pho rong', 'chong nang blushe'],
    brand: 'Blushé Naturals',
    matcher: (p) => /invisible sun shield|chong nang/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'mask_sulwhasoo',
    keywords: ['mat na sulwhasoo', 'sulwhasoo', 'first care', 'mat na sinh hoc', 'mat na thao duoc'],
    negativeKeywords: ['tram tra', 'tra xanh', 'blushe'],
    brand: 'Sulwhasoo',
    matcher: (p) => /sulwhasoo|first care/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'micellar_blushe',
    keywords: ['nuoc tay trang', 'tay trang', 'micellar', 'cleansing water', 'tay trang blushe'],
    brand: 'Blushé Naturals',
    matcher: (p) => /micellar|tay trang/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'lip_dior',
    keywords: ['son dior', 'dior addict', 'lip glow', 'son duong dior', 'dior lip glow', 'son cong chua'],
    negativeKeywords: ['blushe', 'dau hat mo', 'huu co'],
    brand: 'Dior Beauty',
    matcher: (p) => /dior addict|lip glow/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'cushion_dior',
    keywords: ['cushion dior', 'phan nuoc dior', 'dior cushion', 'forever skin glow', 'phan nuoc', 'cushion', 'phan phu dior'],
    brand: 'Dior Beauty',
    matcher: (p) => /forever skin glow|cushion/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'perfume_chanel',
    keywords: ['nuoc hoa chanel', 'chanel no 5', 'chanel 5', 'chanel', 'nuoc hoa nu', 'nuoc hoa'],
    negativeKeywords: ['nuoc hoa hong'],
    brand: 'Chanel',
    matcher: (p) => /chanel/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'combo_blushe',
    keywords: ['bo cham soc da', 'combo 4 mon', 'luxury radiance', 'combo hoang gia', 'bo san pham', 'set duong da', 'quy trinh 4 buoc'],
    brand: 'Blushé Naturals',
    matcher: (p) => /luxury radiance|bo cham soc/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'essence_skii',
    keywords: ['nuoc than', 'sk-ii', 'sk ii', 'sk2', 'pitera', 'facial treatment essence', 'tinh chat sk-ii', 'nuoc than sk-ii'],
    negativeKeywords: ['estee'],
    brand: 'SK-II',
    matcher: (p) => /sk-ii|pitera/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'mask_teatree',
    keywords: ['mat na tram tra', 'mat na blushe', 'sheet mask blushe', 'tea tree sheet mask', 'mat na tra xanh', 'mat na tri mun'],
    negativeKeywords: ['sulwhasoo', 'first care'],
    brand: 'Blushé Naturals',
    matcher: (p) => /tea tree|mat na tram tra/i.test(removeVietnameseTones(p.name))
  },
  {
    id: 'lip_blushe',
    keywords: ['son duong blushe', 'son duong huu co', 'dau hat mo', 'organic lip balm', 'son blushe'],
    negativeKeywords: ['dior', 'addict', 'lip glow'],
    brand: 'Blushé Naturals',
    matcher: (p) => /organic lip balm|dau hat mo/i.test(removeVietnameseTones(p.name))
  }
];

// Khớp sản phẩm thông minh dựa trên cả định danh, thương hiệu và ngữ cảnh
function findProductsByQuery(query, products) {
  const normQuery = removeVietnameseTones(query);
  const matched = [];

  // 1. Khớp từ khóa cụ thể từ bảng định danh
  for (const item of PRODUCT_CATALOG_DEFINITIONS) {
    if (item.negativeKeywords && item.negativeKeywords.some(nk => normQuery.includes(nk))) {
      continue;
    }
    if (item.keywords.some(k => normQuery.includes(k))) {
      const found = products.filter(item.matcher);
      found.forEach(p => {
        if (!matched.some(m => String(m._id) === String(p._id))) {
          matched.push(p);
        }
      });
    }
  }

  if (matched.length > 0) return matched;

  // 2. Nếu người dùng hỏi theo nhóm từ khóa chung:
  // - "son", "son duong", "son moi" -> lấy 2 dòng son
  if (normQuery.includes('son')) {
    const lips = products.filter(p => /lip|son/i.test(removeVietnameseTones(p.name)));
    if (lips.length > 0) return lips;
  }

  // - "mat na", "mask" -> lấy 2 dòng mặt nạ
  if (normQuery.includes('mat na') || normQuery.includes('mask')) {
    const masks = products.filter(p => /mat na|mask/i.test(removeVietnameseTones(p.name)));
    if (masks.length > 0) return masks;
  }

  // - "serum", "tinh chat" -> lấy serum Estée Lauder & Nước thần SK-II
  if (normQuery.includes('serum') || normQuery.includes('tinh chat')) {
    const serums = products.filter(p => /serum|essence|night repair|pitera/i.test(removeVietnameseTones(p.name)));
    if (serums.length > 0) return serums;
  }

  // - "kem duong", "duong am" -> Kem La Mer
  if (normQuery.includes('kem duong') || normQuery.includes('duong am')) {
    const creams = products.filter(p => /la mer|kem duong/i.test(removeVietnameseTones(p.name)));
    if (creams.length > 0) return creams;
  }

  // 3. Khớp theo thương hiệu
  const brandKeywords = [
    { brand: 'Estée Lauder', keys: ['estee lauder', 'estee'] },
    { brand: 'SK-II', keys: ['sk-ii', 'sk ii', 'sk2'] },
    { brand: 'La Mer', keys: ['la mer'] },
    { brand: "Kiehl's", keys: ['kiehl', 'kiehls'] },
    { brand: 'Sulwhasoo', keys: ['sulwhasoo'] },
    { brand: 'Dior Beauty', keys: ['dior'] },
    { brand: 'Chanel', keys: ['chanel'] },
    { brand: 'Blushé Naturals', keys: ['blushe'] }
  ];

  for (const b of brandKeywords) {
    if (b.keys.some(k => normQuery.includes(k))) {
      const brandProducts = products.filter(p => p.brand === b.brand);
      if (brandProducts.length > 0) return brandProducts;
    }
  }

  return [];
}

// Xử lý câu hỏi tiếp nối (Pronoun resolution từ lịch sử chat)
function resolvePronounsFromHistory(query, history = [], products = []) {
  const norm = removeVietnameseTones(query);
  const pronounPatterns = ['no ', 'no?', 'san pham nay', 'san pham do', 'chai nay', 'chai do', 'hu nay', 'hu do', 'cay nay', 'cay do', 'mon nay', 'mon do'];
  const hasPronoun = pronounPatterns.some(p => norm.includes(p)) || norm === 'no' || norm === 'gia bao nhieu' || norm === 'con hang khong';

  if (!hasPronoun || !history || history.length === 0) return query;

  // Lấy các câu trước gần nhất để tìm xem đang nói về sản phẩm nào
  for (let i = history.length - 1; i >= 0; i--) {
    const prevText = history[i].parts?.[0]?.text || history[i].message || '';
    const matched = findProductsByQuery(prevText, products);
    if (matched.length > 0) {
      return `${query} ${matched[0].name}`;
    }
  }
  return query;
}

// Smart Fallback Engine: Xử lý tức thì với độ chính xác 100% dựa trên CSDL MongoDB Atlas
async function generateVerifiedResponse({ message, products, coupons, userOrderContext, history = [] }) {
  const resolvedQuery = resolvePronounsFromHistory(message, history, products);
  const normMsg = removeVietnameseTones(resolvedQuery);
  const lowerMsg = resolvedQuery.toLowerCase();
  let reply = '';
  let matchedProducts = [];
  let suggestions = [];

  // A. BẢO MẬT: CHỐNG PROMPT INJECTION / HACKING
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

  // E. CÂU HỎI NGOÀI PHẠM VI (iPhone, xe máy, laptop, thời tiết...)
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

  // G. KIỂM TRA SẢN PHẨM/THƯƠNG HIỆU ĐỐI THỦ HOẶC KHÔNG CÓ TRÊN WEBSITE
  if (isCompetitorOrNonExistent(resolvedQuery)) {
    reply = `Xin lỗi, hiện tại tôi chưa tìm thấy thông tin chính xác về sản phẩm này tại Blushé Beauty.\n\n` +
      `Danh mục sản phẩm của Blushé Beauty chuyên về mỹ phẩm hữu cơ và chăm sóc da cao cấp từ các thương hiệu chính hãng: **Blushé Naturals, Estée Lauder, Kiehl's, La Mer, SK-II, Sulwhasoo, Dior Beauty, Chanel**.\n\n` +
      `Bạn có thể chia sẻ nhu cầu chăm sóc da (cấp ẩm, kiềm dầu, chống nắng, chống lão hóa...) để em tư vấn các dòng sản phẩm sẵn có tại shop nhé! 🌿`;
    suggestions = ['Serum cho da dầu', 'Kem chống nắng nhạy cảm', 'Mã giảm giá hôm nay'];
    return { reply, products: [], suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // J. KHỚP SẢN PHẨM TRONG DATABASE THEO TỪ KHÓA
  const foundProducts = findProductsByQuery(resolvedQuery, products);

  // H. TỔNG QUAN DANH MỤC / "SHOP CÓ NHỮNG SẢN PHẨM GÌ?" / "SHOP BÁN GÌ?"
  if (
    foundProducts.length === 0 &&
    (normMsg.includes('nhung san pham gi') ||
     normMsg.includes('co san pham gi') ||
     normMsg.includes('shop ban gi') ||
     normMsg.includes('danh muc san pham') ||
     normMsg.includes('cac mat hang') ||
     (normMsg.includes('co nhung gi') && !normMsg.includes('thanh phan') && !normMsg.includes('chong nang')))
  ) {
    reply = `Chào mừng bạn đến với **Blushé Beauty** - Thiên đường mỹ phẩm hữu cơ và chăm sóc da cao cấp chuẩn Quốc tế! 🌿✨\n\n` +
      `Hiện tại shop đang phân phối chính hãng các nhóm sản phẩm nổi bật:\n` +
      `1. **Làm sạch & Cân bằng**: Sữa rửa mặt hữu cơ Blushé, Nước tẩy trang Micellar, Nước hoa hồng Cúc Kiehl's\n` +
      `2. **Tinh chất phục hồi**: Serum Estée Lauder Advanced Night Repair, Nước thần SK-II Pitera\n` +
      `3. **Dưỡng ẩm & Chống nắng**: Kem dưỡng phục hồi La Mer, Kem chống nắng Blushé Invisible Sun Shield SPF50+\n` +
      `4. **Mặt nạ chuyên sâu**: Mặt nạ tràm trà dịu mụn Blushé, Mặt nạ sinh học Sulwhasoo First Care\n` +
      `5. **Son dưỡng & Trang điểm**: Son dưỡng Dior Addict Lip Glow, Son dưỡng hữu cơ Blushé, Phấn nước Dior Forever Skin Glow Cushion\n` +
      `6. **Nước hoa & Combo Hoàng Gia**: Nước hoa Chanel N°5 Eau De Parfum, Combo chăm sóc da 4 món Blushé\n\n` +
      `Bạn đang quan tâm đến dòng sản phẩm nào hoặc cần tư vấn theo tình trạng da của mình cứ nhắn cho em nhé! 🌸`;
    matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 4);
    suggestions = ['Sữa rửa mặt hữu cơ', 'Serum chống lão hóa', 'Kem chống nắng', 'Mã giảm giá'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // I. SO SÁNH HAI SẢN PHẨM
  if (normMsg.includes('so sanh') || normMsg.includes('khac nhau')) {
    let compareList = [];
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

  // J. KHỚP SẢN PHẨM TRONG DATABASE THEO TỪ KHÓA
  // TRƯỜNG HỢP 1: TÌM THẤY 1 SẢN PHẨM CỤ THỂ
  if (foundProducts.length === 1) {
    const targetProduct = foundProducts[0];
    const freshP = await getFreshProduct(targetProduct._id) || targetProduct;

    // 1. Hỏi về TỒN KHO hoặc CÒN HÀNG
    if (
      normMsg.includes('ton kho') ||
      normMsg.includes('con bao nhieu') ||
      normMsg.includes('con hang khong') ||
      normMsg.includes('so luong con') ||
      normMsg.includes('het hang chua') ||
      normMsg.includes('con khong')
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

    // 2. Hỏi về GIÁ BÁN
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

    // 3. Nếu sản phẩm HẾT HÀNG
    if (freshP.stock === 0) {
      reply = `Dạ sản phẩm **${freshP.name}** (${freshP.brand}) hiện đang **HẾT HÀNG** trong kho của Blushé Beauty ❌.\n\n` +
        `• Giá niêm yết: **${formatVND(freshP.salePrice)}** | Dung tích: ${freshP.volume}\n` +
        `• Thành phần: ${freshP.ingredients}\n` +
        `• Công dụng: ${freshP.description}\n\n` +
        `Vì sản phẩm đã hết hàng, shop xin phép không đề xuất đặt mua ngay mà gợi ý bạn tham khảo các sản phẩm thay thế cùng công dụng nhé! 🌸`;
      return { reply, products: [freshP], suggestions: ['Sản phẩm tương tự', 'Mã giảm giá'], provider: 'Blushé Smart AI Engine' };
    }

    // 4. Tư vấn thông tin chi tiết / Thành phần / Công dụng
    reply = `Dạ sản phẩm **${freshP.name}** thuộc thương hiệu **${freshP.brand}** đang có giá ưu đãi là **${formatVND(freshP.salePrice)}** (Giá gốc: ${formatVND(freshP.originalPrice)}), còn **${freshP.stock} sản phẩm** trong kho.\n\n` +
      `• **Loại da phù hợp**: ${freshP.skinType}\n` +
      `• **Dung tích/Khối lượng**: ${freshP.volume} - Xuất xứ: ${freshP.origin}\n` +
      `• **Thành phần chính**: ${freshP.ingredients}\n` +
      `• **Công dụng nổi bật**: ${freshP.description}\n` +
      `• **Hướng dẫn sử dụng**: ${freshP.usage}\n\n` +
      `Bạn có thể bấm vào thẻ sản phẩm bên dưới để xem thêm thông tin và thêm vào giỏ hàng nhé! 🌿`;
    return { reply, products: [freshP], suggestions: ['Tồn kho còn bao nhiêu?', 'Mã giảm giá áp dụng', 'Xem chi tiết'], provider: 'Blushé Smart AI Engine' };
  }

  // TRƯỜNG HỢP 2: TÌM THẤY NHIỀU HƠN 1 SẢN PHẨM (Ví dụ: "Son dưỡng", "Mặt nạ", "Serum", "Kiehl's", "Blushé")
  if (foundProducts.length > 1) {
    // Lấy thông tin tồn kho và giá mới nhất cho từng sản phẩm
    const freshList = await Promise.all(foundProducts.map(async p => (await getFreshProduct(p._id)) || p));

    reply = `Dạ tại Blushé Beauty hiện có **${freshList.length} sản phẩm** chính hãng phù hợp với yêu cầu của bạn:\n\n`;
    freshList.forEach((p, idx) => {
      const stockText = p.stock > 0 ? `Còn ${p.stock} sản phẩm` : `HẾT HÀNG ❌`;
      reply += `${idx + 1}️⃣ **${p.name}** (${p.brand}):\n` +
        `• Giá ưu đãi: **${formatVND(p.salePrice)}** (Giá gốc: ${formatVND(p.originalPrice)}) | Tồn kho: **${stockText}**\n` +
        `• Phù hợp với: ${p.skinType}\n\n`;
    });
    reply += `Bạn có thể bấm vào thẻ sản phẩm bên dưới để xem chi tiết từng món hoặc thêm vào giỏ hàng nhé! 🌿🌸`;
    return { reply, products: freshList, suggestions: ['Xem chi tiết sản phẩm 1', 'Mã giảm giá hôm nay', 'Chính sách vận chuyển'], provider: 'Blushé Smart AI Engine' };
  }

  // K. TƯ VẤN THEO LOẠI DA (DẦU, KHÔ, NHẠY CẢM, LÃO HÓA)
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

  // L. TÌM KIẾM THEO NGÂN SÁCH
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

  // M. NẾU NGƯỜI DÙNG HỎI MUA MỘT SẢN PHẨM KHÔNG CÓ TRÊN HỆ THỐNG
  const purchaseInquiry = ['co ban', 'ban khong', 'tim mua', 'con ban'];
  if (purchaseInquiry.some(p => normMsg.includes(p))) {
    reply = `Xin lỗi, hiện tại tôi chưa tìm thấy thông tin chính xác về sản phẩm này tại Blushé Beauty.\n\n` +
      `Danh mục sản phẩm của Blushé Beauty chuyên về mỹ phẩm hữu cơ và chăm sóc da cao cấp từ các thương hiệu chính hãng: **Blushé Naturals, Estée Lauder, Kiehl's, La Mer, SK-II, Sulwhasoo, Dior Beauty, Chanel**.\n\n` +
      `Bạn có thể chia sẻ nhu cầu chăm sóc da (cấp ẩm, kiềm dầu, chống nắng, chống lão hóa...) để em tư vấn các dòng sản phẩm sẵn có tại shop nhé! 🌿`;
    suggestions = ['Serum cho da dầu', 'Kem chống nắng nhạy cảm', 'Mã giảm giá hôm nay'];
    return { reply, products: [], suggestions, provider: 'Blushé Smart AI Engine' };
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
    const normMsg = removeVietnameseTones(trimmedMsg);
    const candidateProducts = findProductsByQuery(trimmedMsg, products);
    const isCompetitor = isCompetitorOrNonExistent(trimmedMsg);

    const isDirectFactQuery =
      isCompetitor ||
      candidateProducts.length > 0 ||
      normMsg.includes('nhung san pham gi') ||
      normMsg.includes('shop ban gi') ||
      normMsg.includes('danh muc') ||
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

    // 3. Với các câu hỏi tư vấn phức tạp:
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

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 3500)
        );

        const result = await Promise.race([geminiPromise, timeoutPromise]);
        let textReply = result.response.text();

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

    // 4. Fallback tức thì sang Blushé Smart AI Engine
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
